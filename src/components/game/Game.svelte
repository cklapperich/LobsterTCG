<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playmat, CardInstance, CardTemplate, GameState, CounterDefinition, DeckList, ZoneConfig, Action, ActionExecutor } from '../../core';
  import { executeAction, shuffle, moveCard, VISIBILITY, flipCard, endTurn, loadDeck, getCardName, findCardInZones, toReadableState, PluginManager, setOrientation, createDecision, resolveDecision, revealHand, mulligan as mulliganAction, PHASES, ACTION_TYPES } from '../../core';
  import { GAME_TYPES } from '../../game-types';
  import PlaymatGrid from './PlaymatGrid.svelte';
  import ZoneContextMenu from './ZoneContextMenu.svelte';
  import ArrangeModal from './ArrangeModal.svelte';
  import DragOverlay from './DragOverlay.svelte';
  import CounterTray from './CounterTray.svelte';
  import CounterDragOverlay from './CounterDragOverlay.svelte';
  import CoinFlip from './CoinFlip.svelte';
  import ActionPanelView from './ActionPanelView.svelte';
  import { dragStore, startPileDrag, updateDragPosition, endDrag, executeDrop, executeStackDrop } from './dragState.svelte';
  import { DEFAULT_CONFIG, isLocal, isAI, localPlayerIndex, opponent, playerFromZoneKey, isLocalZone, type PlayerConfig, type PlayerController } from './player-config';
  import { fromAIPerspective } from '../../plugins/pokemon/zone-perspective';
  import {
    counterDragStore,
    executeCounterDrop,
    executeCounterReturn,
    clearZoneCounters,
  } from './counterDragState.svelte';
  import { describeAction, type CounterNameResolver } from './describe-action';
  import { createToolContext, type ToolContextDeps } from './create-tool-context';
  import { playSfx, playBgm, stopBgm, toggleMute, audioSettings } from '../../lib/audio.svelte';
  import { settings } from '../../lib/settings.svelte';
  import SettingsModal from './SettingsModal.svelte';
  import { runAutonomousAgent, MODEL_OPTIONS } from '../../ai';
  import { contextMenuStore, openContextMenu, closeContextMenu as closeContextMenuStore } from './contextMenu.svelte';
  import { cardModalStore, openCardModal, closeCardModal as closeCardModalStore } from './cardModal.svelte';

  // Props
  interface Props {
    gameType: string;
    player1Deck?: DeckList;
    player2Deck?: DeckList;
    testFlags?: Record<string, boolean>;
    playmatImage?: string;
    aiModel?: string;
    aiMode?: string;
    playerConfig?: PlayerConfig;
    onBackToMenu?: () => void;
  }

  let { gameType, player1Deck, player2Deck, testFlags = {}, playmatImage, aiModel, playerConfig = DEFAULT_CONFIG, onBackToMenu }: Props = $props();

  // Resolve game type config
  const gameConfig = $derived(GAME_TYPES[gameType]);
  const plugin = $derived(gameConfig.plugin);

  // Derived local player index from config
  const local = $derived(localPlayerIndex(playerConfig));

  // Resolve model config from selected model ID
  const selectedModel = $derived(MODEL_OPTIONS.find(m => m.id === aiModel) ?? MODEL_OPTIONS[0]);

  // Plugin manager for warnings/hooks
  const pluginManager = new PluginManager<CardTemplate>();
  if (gameConfig.hooksPlugin) {
    pluginManager.register(gameConfig.hooksPlugin as any);
  }

  // Whether this game type has AI
  const hasAI = gameConfig.needsAIModel;

  // Game state
  let gameState = $state<GameState<CardTemplate> | null>(null);
  let playmat = $state<Playmat | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let aiThinking = $state(false);
  let pendingDecisionResolve: (() => void) | null = $state(null);

  // Player controllers — polymorphic turn dispatch
  function buildControllers(): [PlayerController, PlayerController] {
    const localCtrl: PlayerController = {
      takeTurn: async () => {},
      takeSetupTurn: async () => {},
      handleDecision: async () => {},
      awaitDecisionResolution: () => new Promise<void>(r => { pendingDecisionResolve = r; }),
    };
    const aiCtrl: PlayerController = {
      takeTurn: () => triggerAITurn(),
      takeSetupTurn: () => triggerAISetupTurn(),
      handleDecision: () => triggerAIDecisionTurn(),
      awaitDecisionResolution: async () => {},
    };
    const builders: Record<string, () => PlayerController> = {
      local: () => localCtrl,
      ai: () => aiCtrl,
      remote: () => localCtrl,
    };
    return [builders[playerConfig.player0](), builders[playerConfig.player1]()];
  }
  const controllers = buildControllers();

  // Derived: is a decision targeting the local player?
  const decisionTargetsHuman = $derived(
    gameState?.pendingDecision != null && isLocal(playerConfig, gameState.pendingDecision.targetPlayer)
  );

  // Reactive drag state from external module
  const dragState = $derived(dragStore.current);
  const counterDragState = $derived(counterDragStore.current);

  // Counter definitions from plugin
  const counterDefinitions = $derived<CounterDefinition[]>(plugin.getCounterDefinitions?.() ?? []);

  // Action panels from plugin (for local player)
  const actionPanels = $derived(
    gameState && plugin.getActionPanels ? plugin.getActionPanels(gameState, local) : []
  );

  // Grid panels (attacks + abilities) vs sidebar panels
  const GRID_PANEL_IDS = new Set(['attacks', 'abilities']);
  const gridPanels = $derived(actionPanels.filter(p => GRID_PANEL_IDS.has(p.id)));
  const sidebarPanels = $derived(actionPanels.filter(p => !GRID_PANEL_IDS.has(p.id)));

  function handleActionPanelClick(panelId: string, buttonId: string) {
    if (!gameState || !plugin.onActionPanelClick) return;
    const action = plugin.onActionPanelClick(gameState, local, panelId, buttonId);
    if (action) {
      tryAction(action);
    } else {
      // Direct mutation path (mulligan etc.)
      gameState = { ...gameState };
    }
  }

  // Get counter definition by ID
  function getCounterById(id: string): CounterDefinition | undefined {
    return counterDefinitions.find((c) => c.id === id);
  }

  // Preview state
  let previewCard = $state<CardInstance<CardTemplate> | null>(null);

  // Game log - derived from state.log (canonical source for AI agents)
  const gameLog = $derived(gameState?.log ?? []);
  let logContainer = $state<HTMLDivElement | null>(null);
  let logInput = $state('');

  // Staging confirmation modal state
  let showStagingConfirm = $state(false);
  let stagingConfirmCallback = $state<(() => void) | null>(null);

  // Request modal state
  let showRequestModal = $state(false);
  let requestInput = $state('');
  let requestInputEl = $state<HTMLInputElement | null>(null);

  // Auto-scroll log to bottom when new entries are added
  $effect(() => {
    if (gameLog.length > 0 && logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  // Announce turn start: SFX + log entry on any turn transition.
  // Dedup key prevents re-firing for the same turn. aiThinking gate
  // ensures this doesn't fire mid-AI-execution.
  let lastAnnouncedKey = '';
  $effect(() => {
    if (!gameState || aiThinking || gameState.pendingDecision) return;
    const key = `${gameState.phase}-${gameState.turnNumber}-${gameState.activePlayer}`;
    if (key !== lastAnnouncedKey) {
      lastAnnouncedKey = key;
      announceTurnStart();
    }
  });

  function announceTurnStart() {
    if (!gameState) return;
    playSfx('turnStart');
    const player = `Player ${gameState.activePlayer + 1}`;
    const turnLabel = gameState.phase === PHASES.PLAYING
      ? `--- Turn ${gameState.turnNumber}: ${player}'s Turn ---`
      : `--- ${player}'s Turn (Setup) ---`;
    gameState.log.push(turnLabel);
  }

  // Auto-open browse modal when a reveal decision targets the human player
  $effect(() => {
    const decision = gameState?.pendingDecision;
    if (decision && isLocal(playerConfig, decision.targetPlayer) && decision.revealedZones.length > 0 && gameState) {
      const zoneKey = decision.revealedZones[0];
      const zone = gameState.zones[zoneKey];
      if (zone && zone.cards.length > 0) {
        const zoneName = zone.config.name ?? zoneKey;
        openCardModal({ cards: [...zone.cards], zoneKey, zoneName, allowReorder: false, shuffleOnConfirm: false, isDecision: true });
      }
    }
  });

  // Context menu - use store
  const contextMenu = $derived(contextMenuStore.current);

  // Card modal - use store
  const cardModal = $derived(cardModalStore.current);

  // PlaymatGrid ref for shuffle
  let playmatGridRef: PlaymatGrid | undefined = $state();

  // Card back from plugin
  const cardBack = plugin.getCardBack?.() ?? '';

  // renderFace from game config (for playing cards without images)
  const renderFace = gameConfig.renderFace;

  // CoinFlip component reference
  let coinFlipRef: CoinFlip | undefined = $state();

  // Write to state.log (canonical source) instead of gameLogStore
  function addLog(message: string) {
    if (!gameState) return;
    gameState.log.push(message);
    gameState = { ...gameState };
  }

  // Try an action through plugin hooks + capacity checks
  function tryAction(action: Action): string | null {
    if (!gameState) return 'No game state';

    const preResult = pluginManager.runPreHooks(gameState, action);
    if (preResult.outcome === 'block') {
      const reason = `Action blocked: ${preResult.reason ?? 'Unknown'}`;
      gameState.log.push(reason);
      gameState = { ...gameState };
      return reason;
    }
    if (preResult.outcome === 'replace') {
      action = preResult.action;
    }
    if (preResult.outcome === 'warn') {
      gameState.log.push(`Warning: ${preResult.reason}`);
    }

    const blocked = executeAction(gameState, action);
    if (blocked) {
      gameState = { ...gameState };
      return blocked;
    }

    // Run post-hooks (e.g., setup face-down, trainer text logging)
    pluginManager.runPostHooks(gameState, action, gameState);

    gameState = { ...gameState };
    return null;
  }

  function handleCoinResult(result: 'heads' | 'tails') {
    const label = `[Player ${(gameState?.activePlayer ?? 0) + 1}]`;
    addLog(`${label} Coin flip: ${result === 'heads' ? 'HEADS' : 'TAILS'}`);
  }

  function createExecutor(): ActionExecutor {
    const sfxMap: Record<string, string> = {
      [ACTION_TYPES.DRAW]: 'cardDrop',
      [ACTION_TYPES.MOVE_CARD]: 'cardDrop',
      [ACTION_TYPES.MOVE_CARD_STACK]: 'cardDrop',
      [ACTION_TYPES.SHUFFLE]: 'shuffle',
      [ACTION_TYPES.MULLIGAN]: 'shuffle',
      [ACTION_TYPES.END_TURN]: 'confirm',
      [ACTION_TYPES.RESOLVE_DECISION]: 'confirm',
      [ACTION_TYPES.CREATE_DECISION]: 'confirm',
      [ACTION_TYPES.SET_ORIENTATION]: 'confirm',
      [ACTION_TYPES.REVEAL_HAND]: 'confirm',
      [ACTION_TYPES.DECLARE_ACTION]: 'confirm',
      [ACTION_TYPES.ADD_COUNTER]: 'cursor',
      [ACTION_TYPES.REMOVE_COUNTER]: 'cursor',
      [ACTION_TYPES.SET_COUNTER]: 'cursor',
    };

    return {
      tryAction: (action: Action) => {
        const blocked = tryAction(action);
        if (!blocked) {
          const sfx = sfxMap[action.type];
          if (sfx) playSfx(sfx as any);
        }
        return blocked;
      },
      flipCoin: async () => {
        const isHeads = Math.random() < 0.5;
        if (coinFlipRef) await coinFlipRef.flip(isHeads);
        return isHeads;
      },
      playSfx: (key: string) => playSfx(key as any),
      shuffleZone: async (playerIndex, zoneKey) => {
        if (!gameState) return;
        playSfx('shuffle');
        if (playmatGridRef) await playmatGridRef.shuffleZone(zoneKey);
        executeAction(gameState, shuffle(playerIndex, zoneKey));
        gameState = { ...gameState };
      },
      addLog: (message: string) => addLog(message),
    };
  }

  // Counter name resolver for describeAction
  const counterNameResolver: CounterNameResolver = (id: string) => getCounterById(id)?.name ?? id;

  onMount(async () => {
    try {
      playmat = await plugin.getPlaymat();
      gameState = await plugin.startGame();

      // Load deck(s): use getDeck() for fixed-deck games, props for selectable
      const deck1 = player1Deck ?? gameConfig.getDeck?.();
      if (deck1 && gameConfig.getTemplate) {
        loadDeck(gameState, 0, `player1_${gameConfig.deckZoneId}`, deck1, gameConfig.getTemplate, false);
      }
      if (gameConfig.playerCount === 2 && player2Deck && gameConfig.getTemplate) {
        loadDeck(gameState, 1, `player2_${gameConfig.deckZoneId}`, player2Deck, gameConfig.getTemplate, false);
      }

      // Execute setup
      gameConfig.executeSetup(gameState, 0);
      if (gameConfig.playerCount === 2) {
        gameConfig.executeSetup(gameState, 1);
      }

      // Test card injection
      if (gameConfig.injectTestCards) {
        for (const [testId, enabled] of Object.entries(testFlags)) {
          if (enabled) {
            gameConfig.injectTestCards(gameState, testId, 0);
            if (gameConfig.playerCount === 2) {
              gameConfig.injectTestCards(gameState, testId, 1);
            }
          }
        }
      }

      gameState.log = ['Game started — Setup Phase'];
      gameState = { ...gameState };
      loading = false;
      if (hasAI) playBgm();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load game';
      loading = false;
    }
  });

  function handleDrop(cardInstanceId: string, toZoneKey: string, position?: number) {
    if (!gameState) return;

    const cardName = getCardName(gameState, cardInstanceId);
    const fromZoneKey = dragStore.current?.fromZoneKey;
    const fromZoneName = fromZoneKey ? (gameState.zones[fromZoneKey]?.config.name ?? fromZoneKey) : '?';
    const updatedState = executeDrop(cardInstanceId, toZoneKey, gameState, position, pluginManager);
    if (updatedState) {
      gameState = updatedState;
      if (fromZoneKey !== toZoneKey) {
        const toZoneName = gameState.zones[toZoneKey]?.config.name ?? toZoneKey;
        addLog(`[Player ${gameState.activePlayer + 1}] Moved ${cardName} from ${fromZoneName} to ${toZoneName}`);
      } else {
        gameState = { ...gameState };
      }
    }
  }

  function handlePreview(card: CardInstance<CardTemplate>) {
    if (card.visibility[local]) {
      previewCard = card;
    }
  }

  function handleToggleVisibility(cardInstanceId: string) {
    if (!gameState) return;

    const result = findCardInZones(gameState, cardInstanceId);
    if (!result) return;

    const { card } = result;
    const newVisibility = card.visibility[local] ? VISIBILITY.HIDDEN : VISIBILITY.PUBLIC;
    const activePlayer = gameState.activePlayer;
    executeAction(gameState, flipCard(activePlayer, cardInstanceId, newVisibility));
    const flipDirection = newVisibility === VISIBILITY.PUBLIC ? 'face up' : 'face down';
    addLog(`[Player ${activePlayer + 1}] Flipped ${card.template.name} ${flipDirection}`);
  }

  // Context menu handlers
  function handleZoneContextMenu(zoneKey: string, zoneName: string, cardCount: number, zoneConfig: ZoneConfig, x: number, y: number) {
    openContextMenu({ zoneKey, zoneName, cardCount, zoneConfig, x, y });
  }

  function handleCloseContextMenu() {
    playSfx('cancel');
    closeContextMenuStore();
  }

  async function handleShuffle() {
    if (!gameState || !contextMenu) return;

    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length < 2) return;

    await createExecutor().shuffleZone(playerFromZoneKey(zoneKey), zoneKey);
    addLog(`[Player ${gameState!.activePlayer + 1}] Shuffled ${gameState!.zones[zoneKey]?.config.name ?? zoneKey}`);
  }

  function handlePeekTop(count: number) {
    if (!contextMenu || !gameState) return;
    const zoneCards = gameState.zones[contextMenu.zoneKey]?.cards ?? [];
    const cards = zoneCards.slice(-count);
    openCardModal({ cards, zoneKey: contextMenu.zoneKey, zoneName: contextMenu.zoneName, allowReorder: true, shuffleOnConfirm: false });
  }

  function handlePeekReorder(displayOrderCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !cardModal) return;
    const zoneKey = cardModal.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone) return;

    // displayOrderCards is top-first; reverse for zone order (bottom-to-top)
    const modalCardIds = new Set(displayOrderCards.map(c => c.instanceId));
    zone.cards = zone.cards.filter(c => !modalCardIds.has(c.instanceId));
    const zoneOrder = [...displayOrderCards].reverse();
    zone.cards.push(...zoneOrder);
    gameState = { ...gameState };
  }

  function handleBrowseZone(zoneKey: string, zoneName: string) {
    if (!gameState) return;
    const zoneCards = gameState.zones[zoneKey]?.cards ?? [];
    if (zoneCards.length === 0) return;
    openCardModal({ cards: [...zoneCards], zoneKey, zoneName, allowReorder: true, shuffleOnConfirm: false });
  }

  function handleSearchZone() {
    if (!gameState || !contextMenu) return;
    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length === 0) return;
    const zoneName = zone.config.name ?? zoneKey;
    openCardModal({ cards: [...zone.cards], zoneKey, zoneName, allowReorder: false, shuffleOnConfirm: true });
  }

  async function handleModalConfirm(selectedCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !cardModal) return;
    const fromZone = cardModal.zoneKey;
    const shouldShuffle = cardModal.shuffleOnConfirm;
    const playerIndex = playerFromZoneKey(fromZone);
    const destZone = settings.searchToHand
      ? `player${playerIndex + 1}_hand`
      : 'staging';

    // Move each selected card to destination
    for (const card of selectedCards) {
      executeAction(gameState, moveCard(playerIndex as 0 | 1, card.instanceId, fromZone, destZone));
    }

    // Close modal first so shuffle animation is visible on the zone
    closeCardModalStore();

    // Shuffle the source zone if flagged
    if (shouldShuffle) {
      await createExecutor().shuffleZone(playerIndex as 0 | 1, fromZone);
    }

    const zoneName = gameState!.zones[fromZone]?.config.name ?? fromZone;
    const destName = destZone === 'staging' ? 'staging' : 'hand';
    const cardNames = selectedCards.map(c => c.template.name).join(', ');
    addLog(`[Player ${playerIndex + 1}] Took ${cardNames} from ${zoneName} to ${destName}`);
  }

  function handleCloseCardModal() {
    playSfx('cancel');
    closeCardModalStore();
  }

  function handleModalResolveDecision() {
    closeCardModalStore();
    handleResolveDecision();
  }

  function resetGame() {
    plugin.startGame().then((state) => {
      // Load deck(s)
      const deck1 = player1Deck ?? gameConfig.getDeck?.();
      if (deck1 && gameConfig.getTemplate) {
        loadDeck(state, 0, `player1_${gameConfig.deckZoneId}`, deck1, gameConfig.getTemplate, false);
      }
      if (gameConfig.playerCount === 2 && player2Deck && gameConfig.getTemplate) {
        loadDeck(state, 1, `player2_${gameConfig.deckZoneId}`, player2Deck, gameConfig.getTemplate, false);
      }

      // Execute setup
      gameConfig.executeSetup(state, 0);
      if (gameConfig.playerCount === 2) {
        gameConfig.executeSetup(state, 1);
      }

      // Test card injection
      if (gameConfig.injectTestCards) {
        for (const [testId, enabled] of Object.entries(testFlags)) {
          if (enabled) {
            gameConfig.injectTestCards(state, testId, 0);
            if (gameConfig.playerCount === 2) {
              gameConfig.injectTestCards(state, testId, 1);
            }
          }
        }
      }

      state.log = ['Game started — Setup Phase'];
      gameState = state;
      previewCard = null;
      closeContextMenuStore();
      closeCardModalStore();
      if (hasAI) playBgm();
    });
  }

  function handleBackToMenu() {
    stopBgm();
    playSfx('cancel');
    onBackToMenu?.();
  }

  // Settings modal
  let showSettings = $state(false);

  // Debug modal
  let showDebugModal = $state(false);
  let debugJson = $state('');
  let debugNarrative = $state('');
  let debugTab = $state<'narrative' | 'json'>('narrative');

  function handleDebug() {
    if (!gameState) return;
    // Snapshot strips Svelte 5 proxy — Object.entries() on proxied templates
    // may not enumerate all keys (e.g. rules[] on trainer cards).
    const snapshot = $state.snapshot(gameState);
    // Narrative: show AI perspective (opponent of local player)
    const aiReadable = pluginManager.applyReadableStateModifier(toReadableState(snapshot, opponent(local)));
    debugNarrative = pluginManager.formatReadableState(aiReadable);
    // JSON: show active player's perspective
    const jsonReadable = pluginManager.applyReadableStateModifier(toReadableState(snapshot, snapshot.activePlayer));
    debugJson = JSON.stringify(jsonReadable, null, 2);
    showDebugModal = true;
  }

  function getToolContextDeps(): ToolContextDeps {
    return {
      getState: () => gameState!,
      getReadableState: (playerIndex) => {
        // Snapshot strips Svelte 5 proxy so Object.entries() enumerates all template fields
        const snapshot = $state.snapshot(gameState!);
        const modified = pluginManager.applyReadableStateModifier(toReadableState(snapshot, playerIndex as 0 | 1));
        return pluginManager.formatReadableState(modified);
      },
      createExecutor,
      controllers,
      localPlayerIndex: local,
      isLocal: (idx) => isLocal(playerConfig, idx as 0 | 1),
      formatCardForSearch: plugin.formatCardForSearch,
      translateZoneKey: (key, aiIdx) => fromAIPerspective(key, aiIdx as 0 | 1),
      describeAction: (state, action) => describeAction(state, action, counterNameResolver),
      onPreviewCard: (card) => { previewCard = card; },
    };
  }

  async function triggerAITurn() {
    if (!gameState || aiThinking || !hasAI) return;
    const currentPlayer = gameState.activePlayer;
    const apiKey = import.meta.env[selectedModel.apiKeyEnv];
    if (!apiKey) return;
    aiThinking = true;
    addLog('[AI] Thinking...');

    const { ctx } = createToolContext(getToolContextDeps());

    try {
      await runAutonomousAgent({
        context: ctx,
        plugin,
        apiKey,
        model: selectedModel.modelId,
        provider: selectedModel.provider,
        logging: true,
      });
    } catch (e) {
      addLog(`[AI] Error: ${e}`);
    }

    // Safety net: if AI didn't end its turn (e.g. hit maxSteps), auto-end
    if (gameState?.activePlayer === currentPlayer && gameState.phase === PHASES.PLAYING) {
      executeAction(gameState, endTurn(currentPlayer));
      gameState = { ...gameState };
      addLog('[AI] Turn auto-ended (AI did not call end_turn)');
    }

    aiThinking = false;
  }

  /**
   * Trigger the AI's setup turn (place initial Pokemon face-down).
   */
  async function triggerAISetupTurn() {
    if (!gameState || aiThinking || !hasAI) return;
    const currentPlayer = gameState.activePlayer;
    const apiKey = import.meta.env[selectedModel.apiKeyEnv];
    if (!apiKey) return;
    aiThinking = true;
    addLog('[AI] Setting up...');

    const { ctx } = createToolContext(getToolContextDeps());

    try {
      await runAutonomousAgent({
        context: ctx,
        plugin,
        apiKey,
        model: selectedModel.modelId,
        provider: selectedModel.provider,
        logging: true,
      });
    } catch (e) {
      addLog(`[AI] Error: ${e}`);
    }

    // Safety net: if AI didn't end its setup turn, auto-end
    if (gameState?.activePlayer === currentPlayer && gameState.phase === PHASES.SETUP) {
      executeAction(gameState, endTurn(currentPlayer));
      gameState = { ...gameState };
      addLog('[AI] Setup auto-ended (AI did not call end_turn)');
    }

    // Setup→playing transition: coin flip + dispatch to winner.
    // Keep aiThinking=true through the transition so UI stays locked during coin flip.
    if (await handlePostSetupTransition()) return;

    aiThinking = false;
  }

  /**
   * Trigger a decision mini-turn for the AI (human created the decision).
   */
  async function triggerAIDecisionTurn() {
    if (!gameState || aiThinking || !hasAI) return;
    const decisionTarget = gameState.pendingDecision?.targetPlayer ?? gameState.activePlayer;
    const apiKey = import.meta.env[selectedModel.apiKeyEnv];
    if (!apiKey) return;
    aiThinking = true;
    addLog('[AI] Responding to decision...');

    const { ctx } = createToolContext(getToolContextDeps(), { isDecisionResponse: true });

    try {
      await runAutonomousAgent({
        context: ctx,
        plugin,
        apiKey,
        model: selectedModel.modelId,
        provider: selectedModel.provider,
        logging: true,
      });
    } catch (e) {
      addLog(`[AI] Error: ${e}`);
    }

    // Safety net: if AI didn't call resolve_decision, auto-resolve
    if (gameState?.pendingDecision) {
      executeAction(gameState, resolveDecision(decisionTarget));
      gameState = { ...gameState };
      addLog('[AI] Decision auto-resolved (AI did not call resolve_decision)');
    }

    aiThinking = false;

  }

  function handleMulligan() {
    if (!gameState || aiThinking) return;
    const action = mulliganAction(gameState.activePlayer);
    const blocked = createExecutor().tryAction(action);
    if (!blocked) {
      addLog(`[Player ${gameState.activePlayer + 1}] Mulliganed`);
    }
  }

  function handleEndTurn() {
    if (!gameState) return;

    // Check if staging has cards — prompt human player for confirmation
    const staging = gameState.zones['staging'];
    if (staging && staging.cards.length > 0 && isLocal(playerConfig, gameState.activePlayer)) {
      showStagingConfirm = true;
      stagingConfirmCallback = () => {
        showStagingConfirm = false;
        stagingConfirmCallback = null;
        executeEndTurnInner();
      };
      return;
    }

    executeEndTurnInner();
  }

  /** Handle setup→playing transition: onSetupComplete (coin flip), then dispatch to winner. */
  async function handlePostSetupTransition(): Promise<boolean> {
    if (!gameState || gameState.phase !== PHASES.PLAYING || gameState.turnNumber !== 1) return false;
    // onSetupComplete may return a PlayerIndex to override who goes first.
    // We apply it here (not inside the callback) because addLog causes
    // gameState reassignment, making the callback's `state` ref stale.
    const firstPlayer = await gameConfig.onSetupComplete?.(gameState, createExecutor());
    if (firstPlayer !== undefined) {
      gameState.activePlayer = firstPlayer;
      gameState.currentTurn.activePlayer = firstPlayer;
    }
    aiThinking = false;
    gameState = { ...gameState };
    controllers[gameState.activePlayer].takeTurn();
    return true;
  }

  async function executeEndTurnInner() {
    if (!gameState) return;
    const currentPlayer = gameState.activePlayer;
    const wasSetup = gameState.phase === PHASES.SETUP;
    const action = endTurn(currentPlayer);
    executeAction(gameState, action);

    const logMsg = wasSetup
      ? `[Player ${currentPlayer + 1}] Ended setup`
      : `[Player ${currentPlayer + 1}] Ended turn`;
    addLog(logMsg);
    playSfx('confirm');

    // Setup just completed → coin flip + dispatch to winner
    if (wasSetup && await handlePostSetupTransition()) return;

    // Still in setup or normal play → dispatch to next player
    if (gameState.phase === PHASES.SETUP) {
      controllers[gameState.activePlayer].takeSetupTurn();
    } else if (gameState.phase === PHASES.PLAYING) {
      controllers[gameState.activePlayer].takeTurn();
    }
  }

  function handleResolveDecision() {
    if (!gameState || !gameState.pendingDecision) return;
    executeAction(gameState, resolveDecision(local));
    addLog(`[Player ${local + 1}] Resolved decision`);
    playSfx('confirm');

    // Unblock the AI's tool call if it was waiting
    if (pendingDecisionResolve) {
      pendingDecisionResolve();
      pendingDecisionResolve = null;
    }
  }

  function handleRequestAction() {
    if (!gameState || aiThinking || gameState.pendingDecision) return;
    showRequestModal = true;
    requestInput = '';
    // Focus input after modal renders
    setTimeout(() => requestInputEl?.focus(), 50);
  }

  function handleRequestSubmit() {
    if (!gameState) return;
    showRequestModal = false;
    const opp = opponent(local);
    executeAction(gameState, createDecision(local, opp, requestInput.trim() || undefined));
    gameState = { ...gameState };
    playSfx('confirm');
    requestInput = '';

    // Dispatch to the target player's controller for the decision
    controllers[opp].handleDecision();
  }

  function handleRequestCancel() {
    showRequestModal = false;
    requestInput = '';
  }

  // Counter handlers
  function handleCounterDrop(counterId: string, cardInstanceId: string) {
    if (!gameState) return;
    const updatedState = executeCounterDrop(counterId, cardInstanceId, gameState);
    if (updatedState) {
      gameState = updatedState;
      const cardName = getCardName(gameState, cardInstanceId);
      const counter = getCounterById(counterId);
      addLog(`Added ${counter?.name ?? counterId} to ${cardName}`);
    }
  }

  function handleCounterReturn() {
    if (!gameState) return;
    const counterId = counterDragStore.current?.counterId;
    const sourceCardId = counterDragStore.current?.source;
    const updatedState = executeCounterReturn(gameState);
    if (updatedState && sourceCardId && sourceCardId !== 'tray') {
      gameState = updatedState;
      const cardName = getCardName(gameState, sourceCardId);
      const counter = getCounterById(counterId ?? '');
      addLog(`Removed ${counter?.name ?? counterId} from ${cardName}`);
    }
  }

  function handleClearCounters() {
    if (!gameState || !contextMenu) return;
    const zoneKey = contextMenu.zoneKey;
    const zoneName = contextMenu.zoneName;
    gameState = clearZoneCounters(zoneKey, gameState);
    addLog(`Cleared all counters from ${zoneName}`);
    playSfx('confirm');
  }

  function handleSetOrientation(degrees: string) {
    if (!gameState || !contextMenu) return;
    const zone = gameState.zones[contextMenu.zoneKey];
    if (!zone || zone.cards.length === 0) return;
    const card = zone.cards.at(-1)!;
    executeAction(gameState, setOrientation(gameState.activePlayer, card.instanceId, degrees));
    const label = degrees === '0' ? 'rotation cleared' : `rotated to ${degrees}°`;
    addLog(`[Player ${gameState.activePlayer + 1}] ${card.template.name} ${label}`);
    playSfx('confirm');
  }

  function handleRevealToOpponent() {
    if (!gameState || !contextMenu) return;

    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    const cardNames = zone?.cards.map(c => c.template.name).join(', ') ?? '';
    const zoneName = zone?.config.name ?? zoneKey;
    const err_or_block_reason = executeAction(gameState, revealHand(local, zoneKey));
    if (err_or_block_reason){
      return;
    }
    addLog(`[Player ${local + 1}] Revealed ${zoneName}: ${cardNames}`);
    playSfx('confirm');

    // Dispatch to the decision target's controller
    if (gameState.pendingDecision) {
      controllers[gameState.pendingDecision.targetPlayer].handleDecision();
    }
  }

  function handleRevealBothHands() {
    if (!gameState || !contextMenu || gameState.pendingDecision) return;
    const zoneKey = contextMenu.zoneKey;
    const opp = opponent(local);

    // Collect card names from both hands BEFORE the reveal action (for logging)
    const playerZone = gameState.zones[zoneKey];
    const playerCardNames = playerZone?.cards.map(c => c.template.name).join(', ') ?? '';
    const suffix = zoneKey.replace(/^player[12]_/, '');
    const opponentZoneKey = `player${opp + 1}_${suffix}`;
    const opponentZone = gameState.zones[opponentZoneKey];
    const opponentCardNames = opponentZone?.cards.map(c => c.template.name).join(', ') ?? '';

    // Pull card effect text from staging zone (the card being resolved)
    const stagingKey = 'staging';
    const stagingCard = gameState.zones[stagingKey]?.cards.at(-1);
    const template = stagingCard && gameConfig.getTemplate ? gameConfig.getTemplate(stagingCard.template.id) : undefined;
    const rules = (template as any)?.rules?.join(' ') ?? '';
    // Include BOTH hands' card names in the decision message so AI sees them
    const handInfo = `\nPlayer ${local + 1} hand: ${playerCardNames}\nYour hand (Player ${opp + 1}): ${opponentCardNames}`;
    const actionMsg = rules
      ? `Both hands revealed. Card effect (${template!.name}): ${rules}${handInfo} — Execute this effect on YOUR hand (move cards, shuffle deck, etc.), then call resolve_decision.`
      : `Both hands revealed.${handInfo} — Execute the card effect on your hand, then call resolve_decision.`;

    executeAction(gameState, revealHand(local, zoneKey, true, actionMsg));
    gameState = { ...gameState };
    playSfx('confirm');

    // Show the opponent's hand to the human (cards are PUBLIC after mutual reveal)
    const opponentZoneNow = gameState.zones[opponentZoneKey];
    if (opponentZoneNow && opponentZoneNow.cards.length > 0) {
      const zoneName = opponentZoneNow.config.name ?? opponentZoneKey;
      openCardModal({ cards: [...opponentZoneNow.cards], zoneKey: opponentZoneKey, zoneName, allowReorder: false, shuffleOnConfirm: false });
    }

    // Dispatch to the decision target's controller
    if (gameState.pendingDecision) {
      controllers[gameState.pendingDecision.targetPlayer].handleDecision();
    }
  }

  function handleMovePile() {
    if (!gameState || !contextMenu) return;
    const zoneKey = contextMenu.zoneKey;
    const zoneName = contextMenu.zoneName;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length === 0) return;

    const cards = [...zone.cards];
    const startX = contextMenu.x;
    const startY = contextMenu.y;
    closeContextMenuStore();
    startPileDrag(cards, zoneKey, startX, startY);

    function onMouseMove(e: MouseEvent) {
      updateDragPosition(e.clientX, e.clientY);
    }
    function onMouseUp(e: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Eat the subsequent click event so the destination zone's browse handler doesn't fire
      document.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }, { capture: true, once: true });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = el?.closest('[data-zone-key]') as HTMLElement | null;
      if (zoneEl && gameState) {
        const toZoneKey = zoneEl.dataset.zoneKey!;
        const updatedState = executeStackDrop(toZoneKey, gameState, undefined, pluginManager);
        if (updatedState) {
          gameState = updatedState;
          const toZoneName = gameState.zones[toZoneKey]?.config.name ?? toZoneKey;
          addLog(`[Player ${gameState.activePlayer + 1}] Moved ${cards.length} cards from ${zoneName} to ${toZoneName}`);
        }
      }
      endDrag();
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
</script>

<div class="game-container font-retro bg-gbc-bg min-h-screen w-screen box-border relative overflow-auto">
  <div class="scanlines"></div>

  <div class="game-content">
  {#if loading}
    <div class="gbc-panel text-center p-8">
      <div class="text-gbc-yellow text-[0.6rem]">LOADING...</div>
    </div>
  {:else if error}
    <div class="gbc-panel text-center p-8">
      <div class="text-gbc-red text-[0.6rem]">ERROR: {error}</div>
    </div>
  {:else if gameState && playmat}
    <div class="game-layout">
      <div class="sidebar">
        <!-- Phase indicator -->
        <div class="gbc-panel phase-panel">
          <div class="phase-header">
            <h1 class="text-base max-sm:text-sm m-0 tracking-wide title-shadow font-retro phase-title text-center flex-1">
              {#if gameState.phase === PHASES.SETUP}
                <span class="text-gbc-yellow">SETUP</span>
              {:else if aiThinking}
                <span class="text-gbc-red animate-pulse">AI THINKING</span>
              {:else if decisionTargetsHuman}
                <span class="text-gbc-red animate-pulse">DECISION</span>
              {:else if gameState.pendingDecision && isAI(playerConfig, gameState.pendingDecision.targetPlayer)}
                <span class="text-gbc-blue animate-pulse">WAITING...</span>
              {:else if isLocal(playerConfig, gameState.activePlayer)}
                <span class="text-gbc-green">YOUR TURN</span>
              {:else}
                <span class="text-gbc-blue">AI TURN</span>
              {/if}
            </h1>
            <button
              class="mute-btn"
              onclick={toggleMute}
              title={audioSettings.bgmMuted ? 'Unmute music' : 'Mute music'}
            >
              {#if audioSettings.bgmMuted}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M3.63 3.63a.75.75 0 0 1 1.06 0L21 19.37a.75.75 0 0 1-1.06 1.06l-3.33-3.33A7.47 7.47 0 0 1 12 19.5V21a.75.75 0 0 1-1.28.53L6 16.81H3a.75.75 0 0 1-.75-.75v-8.12c0-.41.34-.75.75-.75h3L6.72 6.5 3.63 4.69a.75.75 0 0 1 0-1.06ZM12 4.5a.75.75 0 0 1 .75.75v7.19l5.25 5.25V5.25a.75.75 0 0 0-1.28-.53L12 9.44V4.5Z"/>
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"/>
                  <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
                </svg>
              {/if}
            </button>
            <button
              class="mute-btn"
              onclick={() => { showSettings = true; playSfx('cursor'); }}
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.463 7.463 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
          {#if gameState.phase !== PHASES.SETUP}
            <div class="text-center mt-1">
              <span class="text-gbc-light text-[0.45rem]">TURN</span>
              <span class="text-gbc-yellow text-[0.45rem]">{gameState.turnNumber}</span>
            </div>
          {/if}
        </div>

        <!-- Decision message -->
        {#if decisionTargetsHuman && gameState.pendingDecision}
          <div class="gbc-panel decision-msg">
            <span class="text-gbc-yellow text-[0.45rem] font-retro tracking-wide">
              {gameState.pendingDecision.message ?? 'Your opponent requests an action'}
            </span>
          </div>
        {/if}

        <!-- Buttons -->
        <div class="sidebar-buttons">
          {#if decisionTargetsHuman}
            <button
              class="gbc-btn sidebar-btn"
              onclick={handleResolveDecision}
              disabled={!gameState}
            >
              RESOLVE
            </button>
          {:else}
            <button
              class="gbc-btn sidebar-btn"
              onclick={handleEndTurn}
              disabled={!gameState || aiThinking}
            >
              {gameState.phase === PHASES.SETUP ? 'END SETUP' : 'END TURN'}
            </button>
          {/if}
          {#if gameState.phase === PHASES.SETUP}
            <button
              class="gbc-btn sidebar-btn"
              onclick={handleMulligan}
              disabled={!gameState || aiThinking}
            >
              MULLIGAN
            </button>
          {/if}
          {#if hasAI}
          <button
            class="gbc-btn sidebar-btn"
            onclick={handleRequestAction}
            disabled={!gameState || aiThinking || !!gameState.pendingDecision}
          >
            REQUEST
          </button>
          {/if}
          <button
            class="gbc-btn sidebar-btn"
            onclick={() => coinFlipRef?.flip()}
            disabled={coinFlipRef?.isFlipping()}
          >
            COIN
          </button>
          <button class="gbc-btn sidebar-btn" onclick={handleDebug} disabled={!gameState}>
            DEBUG
          </button>
          <button class="gbc-btn sidebar-btn" onclick={resetGame}>
            NEW
          </button>
          {#if onBackToMenu}
            <button class="gbc-btn sidebar-btn" onclick={handleBackToMenu}>
              MENU
            </button>
          {/if}
        </div>

        {#if sidebarPanels.length > 0}
          <ActionPanelView
            panels={sidebarPanels}
            onButtonClick={handleActionPanelClick}
          />
        {/if}

        {#if counterDefinitions.length > 0}
          <CounterTray
            counters={counterDefinitions}
            onCounterReturn={handleCounterReturn}
          />
        {/if}

        <div class="gbc-panel log-panel">
          <div class="text-gbc-yellow text-[0.9rem] text-center mb-2 py-1 px-2 bg-gbc-border">LOG</div>
          <div class="log-content" bind:this={logContainer}>
            {#each gameLog as entry}
              <div class="log-entry text-[0.7rem]" class:text-gbc-yellow={entry.startsWith('Warning:')} class:text-gbc-light={!entry.startsWith('Warning:')}>{entry}</div>
            {/each}
          </div>
          <form class="log-input-bar" onsubmit={(e) => {
            e.preventDefault();
            if (!logInput.trim() || !gameState) return;
            addLog(`[Player ${gameState.activePlayer + 1}] ${logInput.trim()}`);
            logInput = '';
          }}>
            <input
              type="text"
              class="log-input"
              placeholder="Type a message..."
              bind:value={logInput}
            />
          </form>
        </div>
      </div>

      <div class="playmat-area">
        <PlaymatGrid
          bind:this={playmatGridRef}
          {playmat}
          {gameState}
          {cardBack}
          {counterDefinitions}
          {playmatImage}
          {renderFace}
          actionPanels={gridPanels}
          onActionPanelClick={handleActionPanelClick}
          onDrop={handleDrop}
          onPreview={handlePreview}
          onToggleVisibility={handleToggleVisibility}
          onZoneContextMenu={handleZoneContextMenu}
          onCounterDrop={handleCounterDrop}
          onBrowse={handleBrowseZone}
        />
      </div>
    </div>
  {/if}
  </div>

  <!-- Context Menu -->
  {#if contextMenu}
    <ZoneContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      zoneName={contextMenu.zoneName}
      cardCount={contextMenu.cardCount}
      zoneConfig={contextMenu.zoneConfig}
      onShuffle={handleShuffle}
      onPeekTop={handlePeekTop}
      onClearCounters={handleClearCounters}
      onSetOrientation={handleSetOrientation}
      onRevealToOpponent={isLocalZone(playerConfig, contextMenu.zoneKey) && !gameState?.pendingDecision ? handleRevealToOpponent : undefined}
      onRevealBothHands={isLocalZone(playerConfig, contextMenu.zoneKey) && contextMenu.zoneKey.includes('hand') && !gameState?.pendingDecision ? handleRevealBothHands : undefined}
      onMovePile={handleMovePile}
      onSearch={isLocalZone(playerConfig, contextMenu.zoneKey) && !(contextMenu.zoneConfig.defaultVisibility[0] && contextMenu.zoneConfig.defaultVisibility[1]) && !gameState?.pendingDecision ? handleSearchZone : undefined}
      onClose={handleCloseContextMenu}
    />
  {/if}

  <!-- Card Modal (Browse/Search) -->
  {#if cardModal}
    <ArrangeModal
      cards={cardModal.cards}
      zoneName={cardModal.zoneName}
      zoneKey={cardModal.zoneKey}
      allowReorder={cardModal.allowReorder}
      isDecision={cardModal.isDecision}
      {cardBack}
      onConfirm={!cardModal.isDecision ? handleModalConfirm : undefined}
      onReorder={cardModal.allowReorder ? handlePeekReorder : undefined}
      onResolveDecision={cardModal.isDecision ? handleModalResolveDecision : undefined}
      onClose={cardModal.isDecision ? handleModalResolveDecision : handleCloseCardModal}
    />
  {/if}

  <!-- Drag Overlay -->
  {#if dragState}
    <DragOverlay
      card={dragState.card}
      x={dragState.mouseX}
      y={dragState.mouseY}
      {cardBack}
      pileCount={dragState.pileCardIds?.length}
    />
  {/if}

  <!-- Counter Drag Overlay -->
  {#if counterDragState}
    {@const counter = getCounterById(counterDragState.counterId)}
    {#if counter}
      <CounterDragOverlay
        {counter}
        x={counterDragState.mouseX}
        y={counterDragState.mouseY}
      />
    {/if}
  {/if}

  <!-- Fullscreen Card Preview -->
  {#if previewCard && previewCard.visibility[local] && previewCard.template.imageUrl}
    <div class="preview-overlay" onclick={() => previewCard = null} onkeydown={(e) => e.key === 'Escape' && (previewCard = null)} role="button" tabindex="-1">
      <div class="preview-overlay-card">
        <img src={previewCard.template.imageUrl} alt={previewCard.template.name} />
      </div>
    </div>
  {/if}

  <!-- Coin Flip Modal -->
  <CoinFlip
    bind:this={coinFlipRef}
    coinFront={plugin.getCoinFront?.() ?? ''}
    coinBack={plugin.getCoinBack?.() ?? ''}
    onResult={handleCoinResult}
  />

  <!-- Staging Confirmation Modal -->
  {#if showStagingConfirm}
    {@const stagingCards = gameState?.zones['staging']?.cards ?? []}
    <div class="debug-overlay" onclick={() => { showStagingConfirm = false; stagingConfirmCallback = null; }} onkeydown={(e) => { if (e.key === 'Escape') { showStagingConfirm = false; stagingConfirmCallback = null; }}} role="button" tabindex="-1">
      <div class="request-modal gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
        <div class="text-gbc-yellow text-[0.5rem] text-center py-1 px-2 bg-gbc-border">CARDS IN STAGING</div>
        <div class="px-3 py-3 flex flex-col gap-2">
          <span class="text-gbc-light text-[0.45rem]">
            Staging still has cards: {stagingCards.map(c => c.template.name).join(', ')}
          </span>
          <span class="text-gbc-yellow text-[0.45rem]">End turn anyway?</span>
          <div class="flex justify-end gap-2 mt-1">
            <button class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={() => { showStagingConfirm = false; stagingConfirmCallback = null; playSfx('cancel'); }}>CANCEL</button>
            <button class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={() => stagingConfirmCallback?.()}>END TURN</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Request Action Modal -->
  {#if showRequestModal}
    <div class="debug-overlay" onclick={handleRequestCancel} onkeydown={(e) => e.key === 'Escape' && handleRequestCancel()} role="button" tabindex="-1">
      <div class="request-modal gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
        <div class="text-gbc-yellow text-[0.5rem] text-center py-1 px-2 bg-gbc-border">REQUEST ACTION</div>
        <form class="px-3 py-3 flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); handleRequestSubmit(); }}>
          <label for="request-action-input" class="text-gbc-light text-[0.45rem]">Describe what the opponent should do (optional):</label>
          <input
            id="request-action-input"
            type="text"
            class="request-input"
            placeholder="e.g. Discard a card..."
            bind:value={requestInput}
            bind:this={requestInputEl}
          />
          <div class="flex justify-end gap-2 mt-1">
            <button type="button" class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={handleRequestCancel}>CANCEL</button>
            <button type="submit" class="gbc-btn text-[0.45rem] py-1.5 px-4">SEND</button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- Debug Modal -->
  {#if showDebugModal}
    <div class="debug-overlay" onclick={() => showDebugModal = false} onkeydown={(e) => e.key === 'Escape' && (showDebugModal = false)} role="button" tabindex="-1">
      <div class="debug-modal gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
        <div class="flex items-center justify-between mb-2 py-1 px-2 bg-gbc-border">
          <div class="flex items-center gap-2">
            <button
              class="gbc-btn text-[0.45rem] py-0.5 px-2"
              class:active={debugTab === 'narrative'}
              onclick={() => debugTab = 'narrative'}
            >NARRATIVE</button>
            <button
              class="gbc-btn text-[0.45rem] py-0.5 px-2"
              class:active={debugTab === 'json'}
              onclick={() => debugTab = 'json'}
            >JSON</button>
          </div>
          <button class="gbc-btn text-[0.45rem] py-0.5 px-2" onclick={() => showDebugModal = false}>CLOSE</button>
        </div>
        <pre class="debug-json">{debugTab === 'narrative' ? debugNarrative : debugJson}</pre>
      </div>
    </div>
  {/if}

  <!-- Settings Modal -->
  {#if showSettings}
    <SettingsModal onClose={() => { showSettings = false; playSfx('cancel'); }} />
  {/if}
</div>

<style>
  @reference "../../app.css";

  .scanlines {
    @apply absolute inset-0 pointer-events-none z-[100];
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 0.125rem,
      rgba(0, 0, 0, 0.03) 0.125rem,
      rgba(0, 0, 0, 0.03) 0.25rem
    );
  }

  .title-shadow {
    text-shadow:
      0.125rem 0.125rem 0 var(--color-gbc-red),
      0.25rem 0.25rem 0 var(--color-gbc-border);
  }

  .phase-title {
    white-space: nowrap;
  }

  .game-content {
    @apply w-fit mx-auto;
  }

  .game-layout {
    display: grid;
    grid-template-columns: 20rem 1fr;
    grid-template-rows: minmax(0, 1fr);
    gap: 0.5rem;
    height: calc(100vh - 2rem);
    @apply max-lg:flex max-lg:flex-col max-lg:items-center max-lg:h-auto;
  }

  .playmat-area {
    @apply overflow-auto;
    height: 100%;
  }

  .sidebar {
    @apply flex flex-col gap-3 shrink-0 min-h-0 overflow-hidden;
    width: 20rem;
    height: 100%;
    @apply max-lg:w-full max-lg:flex-row max-lg:flex-wrap max-lg:justify-center max-lg:overflow-visible max-lg:h-auto;
  }

  .phase-panel {
    @apply py-2 px-3;
  }

  .phase-header {
    @apply flex items-center gap-1;
  }

  .mute-btn {
    @apply shrink-0 p-1 rounded-sm cursor-pointer;
    @apply text-gbc-light/60 hover:text-gbc-light;
    @apply bg-transparent border-none outline-none;
    transition: color 0.1s;
  }

  .decision-msg {
    @apply py-2 px-3 text-center;
  }

  .sidebar-buttons {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }

  .sidebar-btn {
    @apply text-[0.9rem] py-2 px-3 w-full;
  }

  .log-panel {
    @apply max-lg:w-auto flex flex-col flex-1 min-h-0;
  }

  .log-content {
    @apply overflow-y-auto overflow-x-hidden px-2 flex-1;
    scrollbar-width: thin;
    scrollbar-color: var(--color-gbc-green) var(--color-gbc-border);
  }

  .log-entry {
    @apply py-0.5 border-b border-gbc-border/30;
  }

  .log-input-bar {
    @apply px-2 py-1 border-t border-gbc-border;
  }

  .log-input {
    @apply w-full bg-gbc-dark-green text-gbc-light text-[0.9rem] px-2 py-1 border border-gbc-border rounded-sm;
    @apply outline-none;
  }

  .log-input::placeholder {
    @apply text-gbc-green/50;
  }

  .log-input:focus {
    @apply border-gbc-green;
  }

  .preview-overlay {
    @apply fixed inset-0 z-[150] flex items-center justify-center cursor-pointer;
    background: rgba(0, 0, 0, 0.75);
  }

  .preview-overlay-card {
    pointer-events: none;
  }

  .preview-overlay-card img {
    max-height: 85vh;
    max-width: 90vw;
    object-fit: contain;
    @apply rounded-xl;
  }

  .debug-overlay {
    @apply fixed inset-0 z-[200] flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .debug-modal {
    @apply max-w-4xl w-[90vw] max-h-[80vh] flex flex-col;
  }

  .debug-json {
    @apply overflow-auto px-3 py-2 text-[0.45rem] text-gbc-light font-retro leading-relaxed whitespace-pre m-0;
    scrollbar-width: thin;
    scrollbar-color: var(--color-gbc-green) var(--color-gbc-border);
  }

  .request-modal {
    @apply w-80;
  }

  .request-input {
    @apply w-full bg-gbc-dark-green text-gbc-light text-[0.45rem] px-2 py-1.5 border border-gbc-border rounded-sm font-retro;
    @apply outline-none;
  }

  .request-input::placeholder {
    @apply text-gbc-green/50;
  }

  .request-input:focus {
    @apply border-gbc-green;
  }

  :global(.gbc-btn.active) {
    @apply bg-gbc-green text-gbc-dark-green;
  }
</style>
