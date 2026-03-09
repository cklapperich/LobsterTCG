<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playmat, CardInstance, CardTemplate, GameState, CounterDefinition, DeckSelection, ZoneConfig, Action, ActionExecutor } from '../../core';
  import { executeAction, moveCard, moveCardStack, VISIBILITY, flipCard, endTurn, loadDeck, getCardName, findCardInZones,
    toReadableState, PluginManager, setOrientation, createDecision, resolveDecision, revealHand, mulligan as mulliganAction,
    PHASES, ACTION_TYPES, gameLog, systemLog, draw, coinFlip, addCounter, removeCounter, setCounter, fromPlayerPerspective } from '../../core';
  import { GAME_TYPES } from '../../game-types';
  import PlaymatGrid from './PlaymatGrid.svelte';
  import ZoneContextMenu from './ZoneContextMenu.svelte';
  import ArrangeModal from './ArrangeModal.svelte';
  import DragOverlay from './DragOverlay.svelte';
  import CounterTray from './CounterTray.svelte';
  import CounterDragOverlay from './CounterDragOverlay.svelte';
  import CoinFlip from './CoinFlip.svelte';
  import SplashAnnouncement from './SplashAnnouncement.svelte';
  import type { ActionPanelButton } from '../../core/types/action-panel';
  import { dragStore, startPileDrag, updateDragPosition, endDrag, executeDrop, executeStackDrop } from './dragState.svelte';
  import { DEFAULT_CONFIG, isLocal, isAI, localPlayerIndex, opponent, playerFromZoneKey, isLocalZone, type PlayerConfig, type PlayerController } from './player-config';
  import {
    counterDragStore,
    endCounterDrag,
  } from './counterDragState.svelte';
  import { describeAction, type CounterNameResolver } from './describe-action';
  import { createToolContext, type ToolContextDeps } from './create-tool-context';
  import { playSfx, playBgm, stopBgm, toggleMute, audioSettings } from '../../lib/audio.svelte';
  import { settings } from '../../lib/settings.svelte';
  import type { P2PChannel } from '../../lib/p2p.svelte';
  import { P2PAdapter } from './p2p-adapter';
  import SettingsModal from './SettingsModal.svelte';
  import CardPreviewOverlay from './CardPreviewOverlay.svelte';
  import CoinFlipChoiceModal from './CoinFlipChoiceModal.svelte';
  import StagingConfirmModal from './StagingConfirmModal.svelte';
  import RequestActionModal from './RequestActionModal.svelte';
  import DebugModal from './DebugModal.svelte';
  import { runTurn } from '../../ai';
  import { contextMenuStore, openContextMenu, closeContextMenu as closeContextMenuStore } from './contextMenu.svelte';
  import { cardModalStore, openCardModal, closeCardModal as closeCardModalStore } from './cardModal.svelte';

  // Props
  interface Props {
    gameType: string;
    decks?: DeckSelection[];
    testFlags?: Record<string, boolean>;
    playmatImage?: string;
    aiModel?: string;
    aiMode?: 'autonomous' | 'pipeline';
    plannerModel?: string;
    playerConfig?: PlayerConfig;
    p2pChannel?: P2PChannel;
    onBackToMenu?: () => void;
  }

  let { gameType, decks, testFlags = {}, playmatImage, aiModel, aiMode = 'autonomous', plannerModel, playerConfig = DEFAULT_CONFIG, p2pChannel, onBackToMenu }: Props = $props();

  // Convenience accessors for player decks
  const player1Deck = $derived(decks?.[0]?.deckList);
  const player2Deck = $derived(decks?.[1]?.deckList);

  // Resolve game type config
  const gameConfig = $derived(GAME_TYPES[gameType]);
  const plugin = $derived(gameConfig.plugin);

  // Derived local player index from config
  const local = $derived(localPlayerIndex(playerConfig));

  // Resolve model config from selected model ID


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
  // P2P adapter — wraps P2PChannel with all sync logic. No-ops when no channel.
  // Declared early but initialized after tryAction is defined (see below).
  let p2p: P2PAdapter;

  // Splash announcement
  let splashText = $state<string | null>(null);
  let splashTimer: ReturnType<typeof setTimeout> | null = null;

  function showSplash(text: string) {
    const dur = settings.splashDuration;
    if (splashTimer) clearTimeout(splashTimer);
    splashText = null;
    setTimeout(() => {
      splashText = text;
      splashTimer = setTimeout(() => { splashText = null; }, dur);
    }, 0);
  }

  // Player controllers — polymorphic turn dispatch
  function buildControllers(): [PlayerController, PlayerController] {
    const localCtrl: PlayerController = {
      takeTurn: async () => {},
      takeSetupTurn: async () => {},
      handleDecision: async () => {},
      awaitDecisionResolution: () => new Promise<void>(r => { pendingDecisionResolve = r; }),
    };
    const aiCtrl: PlayerController = {
      takeTurn: () => runAIPhase('turn'),
      takeSetupTurn: () => runAIPhase('setup'),
      handleDecision: () => runAIPhase('decision'),
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

  // True when the local player can perform state-mutating actions
  // (it's their turn OR a decision mini-turn targets them)
  const canLocalAct = $derived(
    gameState != null && (isLocal(playerConfig, gameState.activePlayer) || decisionTargetsHuman)
  );

  // Reactive drag state from external module
  const dragState = $derived(dragStore.current);
  const counterDragState = $derived(counterDragStore.current);

  // Counter definitions from plugin
  const counterDefinitions = $derived<CounterDefinition[]>(plugin.getCounterDefinitions?.() ?? []);

  // Markers from plugin (GX / VSTAR)
  const markers = $derived(
    gameState && plugin.getMarkers ? plugin.getMarkers(gameState, local) : []
  );

  function handleMarkerClick(markerId: string) {
    if (!gameState) return;
    const action = plugin.onMarkerClick?.(gameState, local, markerId);
    if (action) tryAction(action);
  }

  // Action panels from plugin (for local player)
  const actionPanels = $derived(
    gameState && plugin.getActionPanels ? plugin.getActionPanels(gameState, local) : []
  );

  // Derive action buttons for context menu: filter by zoneKey
  const contextMenuActionButtons = $derived.by(() => {
    if (!contextMenu) return [];
    const zoneKey = contextMenu.zoneKey;
    const buttons: (ActionPanelButton & { panelId: string })[] = [];
    for (const panel of actionPanels) {
      for (const btn of panel.buttons) {
        if (btn.zoneKey === zoneKey) {
          buttons.push({ ...btn, panelId: panel.id });
        }
      }
    }
    return buttons;
  });

  function handleActionPanelClick(panelId: string, buttonId: string) {
    if (!gameState || !plugin.onActionPanelClick || !canLocalAct) return;
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

  // Preview state (array for composite previews: LEGEND 2-card, V-UNION 4-card)
  let previewCards = $state<CardInstance<CardTemplate>[]>([]);

  // Game log entries - derived from state.log (canonical source for AI agents)
  const logEntries = $derived(gameState?.log ?? []);
  let logInput = $state('');
  let logEntriesEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    // Auto-scroll log to bottom when entries change
    logEntries.length;
    if (logEntriesEl) {
      logEntriesEl.scrollTop = logEntriesEl.scrollHeight;
    }
  });

  // Staging confirmation modal state
  let showStagingConfirm = $state(false);
  let stagingConfirmCallback = $state<(() => void) | null>(null);

  // Coin flip choice modal state
  let flipWinner = $state<0 | 1 | null>(null);
  let choiceResolve = $state<((p: 0 | 1) => void) | null>(null);

  // Request modal state
  let showRequestModal = $state(false);

  // Announce turn start: SFX + log entry on any turn transition.
  // Dedup key prevents re-firing for the same turn.
  let lastAnnouncedKey = '';
  $effect(() => {
    if (!gameState || gameState.pendingDecision) return;
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
    systemLog(gameState, turnLabel);
    const splashLabel = gameState.phase === PHASES.PLAYING
      ? `TURN ${gameState.turnNumber}\n${player.toUpperCase()}`
      : `SETUP\n${player.toUpperCase()}`;
    showSplash(splashLabel);
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

  // CoinFlip component referenceaddLog
  let coinFlipRef: CoinFlip | undefined = $state();

  // Write to state.log (canonical source) instead of gameLogStore
  function addLog(message: string) {
    if (!gameState) return;
    gameLog(gameState, message);
    gameState = { ...gameState };
  }

  // Try an action through plugin hooks + capacity checks.
  // Snapshot gameState before hooks to avoid Svelte 5 $state proxy issues
  // (Object.values/entries on deeply nested proxied objects can silently drop properties).
  function tryAction(action: Action): string | null {
    if (!gameState) return 'No game state';

    // P2P: inject a deterministic seed into shuffle actions
    action = p2p.prepareAction(action);

    const snapshot = $state.snapshot(gameState) as GameState<CardTemplate>;
    const preResult = pluginManager.runPreHooks(snapshot, action);
    if (preResult.outcome === 'block') {
      const reason = `Action blocked: ${preResult.reason ?? 'Unknown'}`;
      gameLog(gameState, reason);
      gameState = { ...gameState };
      if (!p2p.isRemoteAction) playSfx('error');
      return reason;
    }
    if (preResult.outcome === 'replace') {
      action = preResult.action;
    }
    if (preResult.outcome === 'warn') {
      gameLog(gameState, `Warning: ${preResult.reason}`);
    }

    const blocked = executeAction(gameState, action);
    if (blocked) {
      gameState = { ...gameState };
      if (!p2p.isRemoteAction) playSfx('error');
      return blocked;
    }

    // Run post-hooks on the live state (they may mutate it)
    pluginManager.runPostHooks(gameState, action, gameState);

    // Splash announcements for notable actions
    if (action.type === ACTION_TYPES.DECLARE_ACTION) {
      showSplash(action.name.toUpperCase());
    } else if (action.type === ACTION_TYPES.MOVE_CARD && action.toZone === 'stadium') {
      const stadiumCard = gameState.zones['stadium']?.cards.find(c => c.instanceId === action.cardInstanceId);
      if (stadiumCard) showSplash(stadiumCard.template.name.toUpperCase());
    }

    gameState = { ...gameState };

    // P2P: broadcast local actions to the remote peer
    p2p.broadcastAction(action);

    return null;
  }

  function handleCoinResult(result: 'heads' | 'tails') {
    addLog(`Coin flip: ${result === 'heads' ? 'HEADS' : 'TAILS'}`);
  }

  async function handleManualCoinFlip() {
    if (!gameState) return;
    const isHeads = Math.random() < 0.5;
    tryAction(coinFlip(local, 1, [isHeads]));
    await coinFlipRef?.flip(isHeads);
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
        // In P2P, broadcast the result so the peer plays the animation at the same time.
        p2p.broadcastCoinFlip(isHeads);
        if (coinFlipRef) await coinFlipRef.flip(isHeads);
        return isHeads;
      },
      playSfx: (key: string) => playSfx(key as any),
      shuffleZone: async (playerIndex, zoneKey) => {
        if (!gameState) return;
        playSfx('shuffle');
        if (playmatGridRef) await playmatGridRef.shuffleZone(zoneKey);
        // P2P: use a seeded shuffle so both peers get the same card order
        const shuffleAct = p2p.createSeededShuffle(playerIndex, zoneKey);
        executeAction(gameState, shuffleAct);
        p2p.broadcastAction(shuffleAct);
        gameState = { ...gameState };
      },
      addLog: (message: string) => addLog(message),
      chooseFirstOrSecond: async (winner: 0 | 1, _results: boolean[]): Promise<0 | 1> => {
        const role = playerConfig[`player${winner}` as 'player0' | 'player1'];
        if (role === 'ai') {
          // AI always goes first
          return winner;
        } else if (role === 'local') {
          // Show choice UI, wait for human click
          flipWinner = winner;
          return new Promise<0 | 1>((resolve) => { choiceResolve = resolve; });
        } else {
          // Remote player won — send request, await their response
          return p2p.requestRemoteChoice(winner);
        }
      },
    };
  }

  // Counter name resolver for describeAction
  const counterNameResolver: CounterNameResolver = (id: string) => getCounterById(id)?.name ?? id;

  /** Load decks, run setup, inject test cards, and init the log. */
  function initializeGameState(state: GameState<CardTemplate>) {
    const deck1 = player1Deck ?? gameConfig.getDeck?.();
    if (deck1 && gameConfig.getTemplate) {
      loadDeck(state, 0, `player1_${gameConfig.deckZoneId}`, deck1, gameConfig.getTemplate, false);
    }
    if (gameConfig.playerCount === 2 && player2Deck && gameConfig.getTemplate) {
      loadDeck(state, 1, `player2_${gameConfig.deckZoneId}`, player2Deck, gameConfig.getTemplate, false);
    }

    gameConfig.executeSetup(state, 0);
    if (gameConfig.playerCount === 2) {
      gameConfig.executeSetup(state, 1);
    }

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
  }

  // Initialize P2P adapter — needs tryAction which is defined above
  p2p = new P2PAdapter(p2pChannel, {
    tryAction,
    getCoinFlipRef: () => coinFlipRef ?? null,
    setGameState: (s) => { gameState = s; loading = false; },
    showChoiceUI: (winner, onChoice) => {
      flipWinner = winner;
      choiceResolve = (fp: 0 | 1) => {
        onChoice(fp);
        choiceResolve = null;
        flipWinner = null;
      };
    },
  });

  onMount(() => {
    (async () => {
      try {
        playmat = await plugin.getPlaymat();

        if (p2p.role === 'guest') {
          // Guest: skip local init — wait for the host's state_sync
          const state = await p2p.waitForStateSync();
          gameState = state;
          loading = false;
          p2p.subscribe();
        } else {
          // Host or local game: normal init
          gameState = await plugin.startGame();
          initializeGameState(gameState);
          gameState = { ...gameState };
          loading = false;

          if (p2p.isConnected) {
            // Host: send the full initial state to the guest
            p2p.sendStateSync($state.snapshot(gameState) as GameState<CardTemplate>);
            p2p.subscribe();
          } else if (hasAI) {
            playBgm();
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to load game';
        loading = false;
      }
    })();

    return () => { p2p.destroy(); };
  });

  function handleDrop(cardInstanceId: string, toZoneKey: string, position?: number) {
    if (!gameState || !canLocalAct) {
      playSfx('error');
      return;
    }

    const cardName = getCardName(gameState, cardInstanceId);
    const fromZoneKey = dragStore.current?.fromZoneKey;
    const fromZoneName = fromZoneKey ? (gameState.zones[fromZoneKey]?.config.name ?? fromZoneKey) : '?';
    const updatedState = executeDrop(cardInstanceId, toZoneKey, gameState, position, pluginManager);
    if (updatedState) {
      gameState = updatedState;

      // P2P: broadcast the card move so the remote peer stays in sync
      if (fromZoneKey) {
        p2p.broadcastAction(moveCard(playerFromZoneKey(toZoneKey), cardInstanceId, fromZoneKey, toZoneKey, position));
      }

      if (fromZoneKey !== toZoneKey) {
        const toZoneName = gameState.zones[toZoneKey]?.config.name ?? toZoneKey;
        addLog(`Moved ${cardName} from ${fromZoneName} to ${toZoneName}`);
      } else {
        gameState = { ...gameState };
      }
    } else {
      playSfx('error');
    }
  }

  function handlePreview(card: CardInstance<CardTemplate>) {
    if (!card.visibility[local]) return;
    const composite = gameState && plugin.getCompositePreview?.(card as any, gameState as any);
    previewCards = composite ? [...composite] as CardInstance<CardTemplate>[] : [card];
  }

  function handleToggleVisibility(cardInstanceId: string) {
    if (!gameState || !canLocalAct) return;

    const result = findCardInZones(gameState, cardInstanceId);
    if (!result) return;

    const { card, zone } = result;
    const activePlayer = gameState.activePlayer;

    if (settings.dblClickDeckToDraw && zone.key === `player${local + 1}_deck`) {
      const blocked = tryAction(draw(local, 1));
      if (!blocked) {
        playSfx('cardDrop');
        addLog(`Drew a card`);
      }
      return;
    }

    const newVisibility = card.visibility[local] ? VISIBILITY.HIDDEN : VISIBILITY.PUBLIC;
    tryAction(flipCard(activePlayer, cardInstanceId, newVisibility));
    const flipDirection = newVisibility === VISIBILITY.PUBLIC ? 'face up' : 'face down';
    addLog(`Flipped ${card.template.name} ${flipDirection}`);
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
    if (!gameState || !contextMenu || !canLocalAct) return;

    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length < 2) return;

    await createExecutor().shuffleZone(playerFromZoneKey(zoneKey), zoneKey);
    addLog(`Shuffled ${gameState!.zones[zoneKey]?.config.name ?? zoneKey}`);
  }

  function handlePeekTop(count: number) {
    if (!contextMenu || !gameState || !canLocalAct) return;
    const zoneCards = gameState.zones[contextMenu.zoneKey]?.cards ?? [];
    const cards = zoneCards.slice(-count);
    openCardModal({ cards, zoneKey: contextMenu.zoneKey, zoneName: contextMenu.zoneName, allowReorder: true, shuffleOnConfirm: false });
  }

  function handlePeekReorder(displayOrderCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !cardModal || !canLocalAct) return;
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
    if (!gameState || !contextMenu || !canLocalAct) return;
    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length === 0) return;
    const zoneName = zone.config.name ?? zoneKey;
    openCardModal({ cards: [...zone.cards], zoneKey, zoneName, allowReorder: false, shuffleOnConfirm: true });
  }

  async function handleModalConfirm(selectedCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !cardModal || !canLocalAct) return;
    const fromZone = cardModal.zoneKey;
    const shouldShuffle = cardModal.shuffleOnConfirm;
    const playerIndex = playerFromZoneKey(fromZone);
    const destZone = settings.searchToHand
      ? `player${playerIndex + 1}_hand`
      : 'staging';

    // Move each selected card to destination
    for (const card of selectedCards) {
      tryAction(moveCard(playerIndex as 0 | 1, card.instanceId, fromZone, destZone));
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
    addLog(`Took ${cardNames} from ${zoneName} to ${destName}`);
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
      initializeGameState(state);
      gameState = state;
      previewCards = [];
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
  let showFullLog = $state(false);
  let showDebugModal = $state(false);
  let debugJson = $state('');
  let debugNarrative = $state('');

  function handleDebug() {
    if (!gameState) return;
    // Snapshot strips Svelte 5 proxy — Object.entries() on proxied templates
    // may not enumerate all keys (e.g. rules[] on trainer cards).
    const snapshot = $state.snapshot(gameState);
    // Narrative: show AI perspective (opponent of local player)
    const aiIdx = opponent(local) as 0 | 1;
    const oppIdx = aiIdx === 0 ? 1 : 0;
    const debugOmniscient = new Set([
      `player${aiIdx + 1}_deck`,
      `player${oppIdx + 1}_hand`,
    ]);
    const aiReadable = pluginManager.applyReadableStateModifier(toReadableState(snapshot, aiIdx, debugOmniscient));
    aiReadable.deckStrategy = decks?.[aiIdx]?.strategy;
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
        const aiIdx = playerIndex as 0 | 1;
        const oppIdx = aiIdx === 0 ? 1 : 0;
        const omniscientZones = new Set([
          `player${aiIdx + 1}_deck`,
          `player${oppIdx + 1}_hand`,
        ]);
        const modified = pluginManager.applyReadableStateModifier(toReadableState(snapshot, aiIdx, omniscientZones));
        modified.deckStrategy = decks?.[aiIdx]?.strategy;
        return pluginManager.formatReadableState(modified);
      },
      createExecutor,
      controllers,
      localPlayerIndex: local,
      isLocal: (idx) => isLocal(playerConfig, idx as 0 | 1),
      formatCardForSearch: plugin.formatCardForSearch,
      counterTypes: plugin.getAICounterTypes?.(),
      translateZoneKey: (key, aiIdx) => fromPlayerPerspective(key, aiIdx as 0 | 1),
      describeAction: (state, action) => describeAction(state, action, counterNameResolver),
      onPreviewCard: (card) => { previewCards = [card]; },
      createCheckpoint: () => JSON.parse(JSON.stringify($state.snapshot(gameState!))),
      restoreState: (snapshot) => { gameState = snapshot as GameState<CardTemplate>; gameState = { ...gameState }; },
    };
  }

  type AIPhase = 'turn' | 'setup' | 'decision';

  async function runAIPhase(phase: AIPhase) {
    if (!gameState || aiThinking || !hasAI) return;

    const currentPlayer = phase === 'decision'
      ? (gameState.pendingDecision?.targetPlayer ?? gameState.activePlayer)
      : gameState.activePlayer;

    aiThinking = true;
    addLog(phase === 'decision' ? 'Responding to decision...' : phase === 'setup' ? 'Setting up...' : 'Thinking...');

    const { ctx } = createToolContext(
      getToolContextDeps(),
      phase === 'decision' ? { isDecisionResponse: true } : undefined
    );

    try {
      await runTurn({
        context: ctx,
        plugin,
        model: aiModel!,
        plannerModel: plannerModel ?? aiModel!,
        aiMode,
        logging: true,
      });
    } catch (e) {
      addLog(`Error: ${e}`);
    }

    // Safety nets: auto-complete if AI didn't call the expected concluding action
    if (phase === 'decision') {
      if (gameState?.pendingDecision) {
        executeAction(gameState, resolveDecision(currentPlayer));
        gameState = { ...gameState };
        addLog('Decision auto-resolved (AI did not call resolve_decision)');
      }
    } else {
      const expectedPhase = phase === 'setup' ? PHASES.SETUP : PHASES.PLAYING;
      if (gameState?.activePlayer === currentPlayer && gameState.phase === expectedPhase) {
        executeAction(gameState, endTurn(currentPlayer));
        gameState = { ...gameState };
        addLog(`${phase === 'setup' ? 'Setup' : 'Turn'} auto-ended (AI did not call end_turn)`);
      }
    }

    // Setup→playing transition: coin flip + dispatch to winner
    if (phase === 'setup' && await handlePostSetupTransition()) return;

    aiThinking = false;
  }

  function handleMulligan() {
    if (!gameState || !canLocalAct) return;
    const action = mulliganAction(gameState.activePlayer);
    const blocked = createExecutor().tryAction(action);
    if (!blocked) {
      addLog('Mulliganed');
    }
  }

  function handleEndTurn() {
    if (!gameState || !canLocalAct) return;

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
    // onSetupComplete animates the coin flip and dispatches a COIN_FLIP action with
    // setActivePlayer — the engine applies activePlayer on both peers via P2P broadcast.
    await gameConfig.onSetupComplete?.(gameState, createExecutor());
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
    tryAction(action);

    addLog(wasSetup ? 'Ended setup' : 'Ended turn');
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
    tryAction(resolveDecision(local));
    addLog('Resolved decision');
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
  }

  function handleRequestSubmit(value: string) {
    if (!gameState) return;
    showRequestModal = false;
    const opp = opponent(local);
    tryAction(createDecision(local, opp, value || undefined));
    playSfx('confirm');
    controllers[opp].handleDecision();
  }

  function handleRequestCancel() {
    showRequestModal = false;
  }

  // Counter handlers
  function handleCounterDrop(counterId: string, cardInstanceId: string) {
    if (!gameState || !canLocalAct) return;
    const drag = counterDragStore.current;
    if (!drag) return;
    const sourceCardId = drag.source !== 'tray' ? drag.source : null;
    endCounterDrag();

    const cardName = getCardName(gameState, cardInstanceId);
    const counter = getCounterById(counterId);
    if (sourceCardId) {
      tryAction(removeCounter(local, sourceCardId, counterId, 1));
    }
    tryAction(addCounter(local, cardInstanceId, counterId, 1));
    addLog(`Added ${counter?.name ?? counterId} to ${cardName}`);
    playSfx('cursor');
  }

  function handleCounterReturn() {
    if (!gameState || !canLocalAct) return;
    const drag = counterDragStore.current;
    if (!drag || drag.source === 'tray') { endCounterDrag(); return; }
    const { counterId, source: sourceCardId } = drag;
    endCounterDrag();

    const cardName = getCardName(gameState, sourceCardId);
    const counter = getCounterById(counterId);
    tryAction(removeCounter(local, sourceCardId, counterId, 1));
    addLog(`Removed ${counter?.name ?? counterId} from ${cardName}`);
    playSfx('cancel');
  }

  function handleClearCounters() {
    if (!gameState || !contextMenu || !canLocalAct) return;
    const zoneKey = contextMenu.zoneKey;
    const zoneName = contextMenu.zoneName;
    const zone = gameState.zones[zoneKey];
    if (zone) {
      for (const card of zone.cards) {
        for (const counterType of Object.keys(card.counters)) {
          tryAction(setCounter(local, card.instanceId, counterType, 0));
        }
      }
    }
    addLog(`Cleared all counters from ${zoneName}`);
    playSfx('confirm');
  }

  function handleSetOrientation(degrees: string) {
    if (!gameState || !contextMenu || !canLocalAct) return;
    const zone = gameState.zones[contextMenu.zoneKey];
    if (!zone || zone.cards.length === 0) return;
    const card = zone.cards.at(-1)!;
    tryAction(setOrientation(gameState.activePlayer, card.instanceId, degrees));
    const label = degrees === '0' ? 'rotation cleared' : `rotated to ${degrees}°`;
    addLog(`${card.template.name} ${label}`);
    playSfx('confirm');
  }

  function handleRevealToOpponent() {
    if (!gameState || !contextMenu || !canLocalAct) return;

    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    const cardNames = zone?.cards.map(c => c.template.name).join(', ') ?? '';
    const zoneName = zone?.config.name ?? zoneKey;
    const err_or_block_reason = tryAction(revealHand(local, zoneKey));
    if (err_or_block_reason) {
      return;
    }
    addLog(`Revealed ${zoneName}: ${cardNames}`);
    playSfx('confirm');

    // Dispatch to the decision target's controller
    if (gameState.pendingDecision) {
      controllers[gameState.pendingDecision.targetPlayer].handleDecision();
    }
  }

  function handleMovePile() {
    if (!gameState || !contextMenu || !canLocalAct) return;
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
        const fromZoneKey = dragStore.current?.fromZoneKey;
        const pileCardIds = dragStore.current?.pileCardIds ? [...dragStore.current.pileCardIds] : undefined;
        const updatedState = executeStackDrop(toZoneKey, gameState, undefined, pluginManager);
        if (updatedState) {
          gameState = updatedState;
          const toZoneName = gameState.zones[toZoneKey]?.config.name ?? toZoneKey;
          addLog(`Moved ${cards.length} cards from ${zoneName} to ${toZoneName}`);

          // P2P: broadcast the pile move so the remote peer stays in sync
          if (fromZoneKey && pileCardIds) {
            p2p.broadcastAction(moveCardStack(playerFromZoneKey(toZoneKey), pileCardIds, fromZoneKey, toZoneKey));
          }
        }
      }
      endDrag();
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
</script>

<div class="game-container font-retro bg-gbc-bg h-screen w-screen box-border relative overflow-hidden">
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
                {#if isLocal(playerConfig, gameState.activePlayer)}
                  <span class="text-gbc-green">YOUR SETUP</span>
                {:else}
                  <span class="text-gbc-blue">FRIEND'S SETUP</span>
                {/if}
              {:else if aiThinking}
                <span class="text-gbc-red animate-pulse">AI THINKING</span>
              {:else if decisionTargetsHuman}
                <span class="text-gbc-red animate-pulse">DECISION</span>
              {:else if gameState.pendingDecision && isAI(playerConfig, gameState.pendingDecision.targetPlayer)}
                <span class="text-gbc-blue animate-pulse">WAITING...</span>
              {:else if isLocal(playerConfig, gameState.activePlayer)}
                <span class="text-gbc-green">YOUR TURN</span>
              {:else}
                <span class="text-gbc-blue">FRIEND'S TURN</span>
              {/if}
            </h1>
            <span class="text-gbc-yellow text-[0.45rem] leading-none self-center">{gameState.turnNumber}</span>
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
              disabled={!gameState || !canLocalAct}
            >
              {gameState.phase === PHASES.SETUP ? 'END SETUP' : 'END TURN'}
            </button>
          {/if}
          {#if gameState.phase === PHASES.SETUP}
            <button
              class="gbc-btn sidebar-btn"
              onclick={handleMulligan}
              disabled={!gameState || !canLocalAct}
            >
              MULLIGAN
            </button>
          {/if}
          {#if hasAI}
          <button
            class="gbc-btn sidebar-btn"
            onclick={handleRequestAction}
            disabled={!gameState || !canLocalAct || !!gameState.pendingDecision}
          >
            REQUEST
          </button>
          {/if}
          <button
            class="gbc-btn sidebar-btn"
            onclick={handleManualCoinFlip}
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
              QUIT
            </button>
          {/if}
        </div>

        {#if counterDefinitions.length > 0}
          <CounterTray
            counters={counterDefinitions}
            onCounterReturn={handleCounterReturn}
            {markers}
            onMarkerClick={handleMarkerClick}
          />
        {/if}

        <div class="gbc-panel log-panel">
          <div class="log-header-btn">LOG</div>
          <div class="log-entries" bind:this={logEntriesEl}>
            {#each logEntries as entry}
              <div class="log-entry-inline" class:text-gbc-yellow={entry.startsWith('Warning:')} class:text-gbc-light={!entry.startsWith('Warning:')}>{entry}</div>
            {/each}
          </div>
          <form class="log-input-bar" onsubmit={(e) => {
            e.preventDefault();
            if (!logInput.trim() || !gameState) return;
            addLog(logInput.trim());
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
          localPlayer={local}
          {cardBack}
          {counterDefinitions}
          {playmatImage}
          {renderFace}
          onDrop={handleDrop}
          onPreview={handlePreview}
          onToggleVisibility={handleToggleVisibility}
          onZoneContextMenu={handleZoneContextMenu}
          onCounterDrop={handleCounterDrop}
          onBrowse={handleBrowseZone}
        >
          <SplashAnnouncement text={splashText} duration={settings.splashDuration} />
        </PlaymatGrid>
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
      actionButtons={contextMenuActionButtons}
      onActionButtonClick={handleActionPanelClick}
      onShuffle={handleShuffle}
      onPeekTop={handlePeekTop}
      onClearCounters={handleClearCounters}
      onSetOrientation={handleSetOrientation}
      onRevealToOpponent={isLocalZone(playerConfig, contextMenu.zoneKey) && !gameState?.pendingDecision ? handleRevealToOpponent : undefined}
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
  <CardPreviewOverlay cards={previewCards} onClose={() => previewCards = []} />

  <!-- Coin Flip Modal -->
  <CoinFlip
    bind:this={coinFlipRef}
    coinFront={plugin.getCoinFront?.() ?? ''}
    coinBack={plugin.getCoinBack?.() ?? ''}
    onResult={handleCoinResult}
  />

  <!-- Coin Flip Choice Modal -->
  {#if choiceResolve !== null}
    <CoinFlipChoiceModal
      flipWinner={flipWinner!}
      onChoose={(fp) => {
        const resolve = choiceResolve;
        choiceResolve = null;
        flipWinner = null;
        resolve?.(fp);
      }}
    />
  {/if}

  <!-- Staging Confirmation Modal -->
  {#if showStagingConfirm}
    <StagingConfirmModal
      cards={gameState?.zones['staging']?.cards ?? []}
      onConfirm={() => stagingConfirmCallback?.()}
      onCancel={() => { showStagingConfirm = false; stagingConfirmCallback = null; playSfx('cancel'); }}
    />
  {/if}

  <!-- Request Action Modal -->
  {#if showRequestModal}
    <RequestActionModal onSubmit={handleRequestSubmit} onCancel={handleRequestCancel} />
  {/if}

  <!-- Full Log Modal -->
  {#if showFullLog}
    <div class="debug-overlay" onclick={() => showFullLog = false} onkeydown={(e) => e.key === 'Escape' && (showFullLog = false)} role="button" tabindex="-1">
      <div class="debug-modal gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
        <div class="flex items-center justify-between mb-2 py-1 px-2 bg-gbc-border">
          <span class="text-gbc-yellow text-[0.5rem]">FULL LOG</span>
          <button class="gbc-btn text-[0.45rem] py-0.5 px-2" onclick={() => showFullLog = false}>CLOSE</button>
        </div>
        <div class="debug-json">
          {#each logEntries as entry}
            <div class="log-entry text-[0.7rem]" class:text-gbc-yellow={entry.startsWith('Warning:')} class:text-gbc-light={!entry.startsWith('Warning:')}>{entry}</div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Debug Modal -->
  {#if showDebugModal}
    <DebugModal narrative={debugNarrative} json={debugJson} onClose={() => showDebugModal = false} />
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
    @apply w-full h-full;
  }

  .game-layout {
    display: grid;
    grid-template-columns: 20rem 1fr;
    grid-template-rows: minmax(0, 1fr);
    gap: 0.5rem;
    height: 100%;
    @apply max-lg:flex max-lg:flex-col max-lg:items-center max-lg:h-auto;
  }

  .playmat-area {
    position: relative;
    height: 100%;
    overflow: hidden;
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
    @apply max-lg:w-auto flex flex-col flex-1 min-h-0 overflow-hidden;
  }

  .log-header-btn {
    @apply w-full text-gbc-yellow text-[0.9rem] text-center mb-2 py-1 px-2 bg-gbc-border font-retro;
  }

  .log-entries {
    @apply flex-1 min-h-0 overflow-y-auto px-2 py-1 flex flex-col gap-0.5;
  }

  .log-entry-inline {
    @apply text-[0.6rem] leading-snug break-words;
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

</style>
