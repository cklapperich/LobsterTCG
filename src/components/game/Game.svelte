<script lang="ts">
  /**
   * Game.svelte — primary in-game view and session controller.
   *
   * Exists as the single component that owns an active game session end-to-end.
   * Everything from "decks selected" to "game over" lives here; child components
   * are purely presentational and delegate all state changes back through here.
   *
   * Responsibilities:
   *  - Own and mutate the live GameState (all actions funnel through tryAction)
   *  - Render the playmat grid and all overlay UI (modals, context menus, coin flip, etc.)
   *  - Drive the AI/agent pipeline (between-turns, main-turn, setup phases)
   *  - Handle the custom drag-and-drop system for cards and counters
   *  - Sync actions over P2P (broadcast local actions, execute remote ones)
   *  - Wire plugin hooks (pre/post action hooks, action panels, markers)
   *  - Manage setup flow: mulligan decisions, coin flip, first-player choice
   */
  import { onMount } from 'svelte';
  import type { CardInstance, CardTemplate, PlayerIndex } from '../../core/types/card';
  import type { ZoneConfig } from '../../core/types/zone';
  import type { Playmat } from '../../core/types/playmat';
  import type { GameState } from '../../core/types/game';
  import type { CounterDefinition } from '../../core/types/counter';
  import type { BoardWidget } from '../../core/types/board-widget';
  import type { DeckSelection } from '../../core/types/deck';
  import type { Action } from '../../core/types/action';
  import type { ActionExecutor } from '../../core/action-executor';
  import { executeAction, loadDeck, findCardInZones, checkOpponentZone } from '../../core/engine';
  import { moveCard, moveCardStack, flipCard, startTurn, endTurn, setOrientation, createDecision, resolveDecision, revealHand, mulligan as mulliganAction, draw, coinFlip, addCounter, removeCounter, setCounter } from '../../core/action';
  import { toReadableState } from '../../core/readable';
  import { PluginManager } from '../../core/plugin/plugin-manager';
  import { VISIBILITY } from '../../core/types/card';
  import { PHASES, ACTION_TYPES } from '../../core/types/constants';
  import { gameLog, systemLog } from '../../core/game-log';
  import { fromPlayerPerspective } from '../../core/zone-perspective';
  import { GAME_TYPES } from '../../game-types';
  import PlaymatGrid from './PlaymatGrid.svelte';
  import ZoneContextMenu from './ZoneContextMenu.svelte';
  import ArrangeModal from './ArrangeModal.svelte';
  import DragOverlay from './DragOverlay.svelte';
  import CounterDragOverlay from './CounterDragOverlay.svelte';
  import CoinFlip from './CoinFlip.svelte';
  import SplashAnnouncement from './SplashAnnouncement.svelte';
  import type { ActionPanelButton } from '../../core/types/action-panel';
  import { dragStore, startPileDrag, updateDragPosition, endDrag } from './dragState.svelte';
  import { DEFAULT_CONFIG, isLocal, localPlayerIndex, opponent, playerFromZoneKey, isLocalZone, type PlayerConfig, type PlayerController } from './player-config';
  import {
    counterDragStore,
    endCounterDrag,
  } from './counterDragState.svelte';
  import { describeAction, type CounterNameResolver } from './describe-action';
  import { createToolContext, type ToolContextDeps } from './create-tool-context';
  import { playSfx, playBgm} from '../../lib/audio.svelte';
  import { settings } from '../../lib/settings.svelte';
  import type { P2PChannel } from '../../lib/p2p.svelte';
  import { P2PAdapter } from './p2p-adapter';
  import GameSidebar from './GameSidebar.svelte';
  import SettingsModal from './SettingsModal.svelte';
  import CardPreviewOverlay from './CardPreviewOverlay.svelte';
  import CoinFlipChoiceModal from './CoinFlipChoiceModal.svelte';
  import StagingConfirmModal from './StagingConfirmModal.svelte';
  import RequestActionModal from './RequestActionModal.svelte';
  import DebugModal from './DebugModal.svelte';
  import { runTurn } from '../../ai/run-turn';
  import { contextMenuStore, openContextMenu, closeContextMenu as closeContextMenuStore } from './contextMenu.svelte';
  import { cardModalStore, openCardModal, closeCardModal as closeCardModalStore } from './cardModal.svelte';

  // Action → SFX mapping: single source of truth for all action paths (UI, AI, drag-drop)
  const ACTION_SFX_MAP: Record<string, string> = {
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

  // Props
  interface Props {
    gameType: string;
    decks?: DeckSelection[];
    testFlags?: Record<string, boolean>;
    playmatImage?: string;
    cardBack?: string;
    aiModel?: string;
    aiMode?: 'autonomous' | 'pipeline';
    plannerModel?: string;
    playerConfig?: PlayerConfig;
    p2pChannel?: P2PChannel;
    onBackToMenu?: () => void;
  }

  let { gameType, decks, testFlags = {}, playmatImage, cardBack = '', aiModel, aiMode = 'autonomous', plannerModel, playerConfig = DEFAULT_CONFIG, p2pChannel, onBackToMenu }: Props = $props();

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
  let turnFlow = $state<{ tag: 'local' | 'waiting' | 'transition' }>({ tag: 'local' });
  let setupTransitionComplete = $state(false);
  let lastStartTurnKey = '';
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

  /** Single source of truth for "what happens next after state changes". */
  async function advance() {
    if (turnFlow.tag !== 'local') return; // re-entry guard
    const gs = gameState;
    if (!gs) return;

    // Decision pending — dispatch to non-local responder
    if (gs.pendingDecision) {
      const responder = gs.pendingDecision.targetPlayer;
      if (isLocal(playerConfig, responder)) return; // human responds via UI
      const playerBefore = gs.activePlayer;
      const phaseBefore = gs.phase;
      turnFlow = { tag: 'waiting' };
      await controllers[responder].handleDecision();
      turnFlow = { tag: 'local' };
      if (gameState?.activePlayer !== playerBefore || gameState?.phase !== phaseBefore) advance();
      return;
    }

    // Setup→playing transition: coin flip (fires exactly once)
    // Must run before the isLocal early return — the coin flip determines
    // who actually goes first, regardless of which player the engine defaults to.
    if (gs.phase === PHASES.PLAYING && gs.turnNumber === 1 && !setupTransitionComplete) {
      setupTransitionComplete = true;
      // P2P guest: skip onSetupComplete — the host runs it and broadcasts
      // all actions (coin flip, first-player choice) via P2P.
      if (p2p.role !== 'guest') {
        turnFlow = { tag: 'transition' };
        await gameConfig.onSetupComplete?.(gs, createExecutor());
        if (!gameState) return;
        gameState = { ...gameState };
        turnFlow = { tag: 'local' };
      }
      advance();
      return;
    }

    // Fire START_TURN marker so plugin hooks can run turn-start logic (once per turn)
    const stKey = `${gs.turnNumber}-${gs.activePlayer}`;
    if (gs.phase === PHASES.PLAYING && stKey !== lastStartTurnKey) {
      lastStartTurnKey = stKey;
      tryAction(startTurn(gs.activePlayer, Math.floor(Math.random() * 0x7FFFFFFF)));
    }

    // Setup phase: kick off all non-local, non-complete players concurrently
    if (gs.phase === PHASES.SETUP) {
      for (const pi of [0, 1] as PlayerIndex[]) {
        if (!gs.setupComplete[pi] && !isLocal(playerConfig, pi)) {
          turnFlow = { tag: 'waiting' };
          await controllers[pi].takeSetupTurn();
          turnFlow = { tag: 'local' };
        }
      }
      // If both done after AI finished, recurse to hit the transition
      if (gameState?.setupComplete[0] && gameState?.setupComplete[1]) {
        advance();
      }
      return;
    }

    if (isLocal(playerConfig, gs.activePlayer)) return; // human's turn, UI handles it

    // Non-local controller's turn (AI or remote no-op)
    const playerBefore = gs.activePlayer;
    const phaseBefore = gs.phase;
    turnFlow = { tag: 'waiting' };
    await controllers[gs.activePlayer].takeTurn();
    turnFlow = { tag: 'local' };
    // Only recurse if state changed — remote no-op controllers return immediately
    // with unchanged activePlayer, so they don't cause recursion
    if (gameState?.activePlayer !== playerBefore || gameState?.phase !== phaseBefore) advance();
  }

  // Derived: is a decision targeting the local player?
  const decisionTargetsHuman = $derived(
    gameState?.pendingDecision != null && isLocal(playerConfig, gameState.pendingDecision.targetPlayer)
  );

  // True when the local player can perform state-mutating actions
  // During setup: local can act until they've completed setup
  // During play: it's their turn OR a decision mini-turn targets them
  const canLocalAct = $derived(
    gameState != null && (
      (gameState.phase === PHASES.SETUP && !gameState.setupComplete[local])
      || (gameState.phase !== PHASES.SETUP && (isLocal(playerConfig, gameState.activePlayer) || decisionTargetsHuman))
    )
  );

  // During setup, actions should be attributed to the local player (not activePlayer)
  const actingPlayer = $derived(
    gameState?.phase === PHASES.SETUP ? local : (gameState?.activePlayer ?? 0)
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

  // Board widgets from plugin (energy zone, etc.)
  // Must snapshot gameState to unwrap Svelte 5 proxy before plugin reads pluginState
  const boardWidgets = $derived.by<BoardWidget[]>(() => {
    if (!gameState || !plugin.getBoardWidgets) return [];
    const snap = $state.snapshot(gameState) as GameState<CardTemplate>;
    return plugin.getBoardWidgets(snap, local);
  });

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

  // Modal refs
  let stagingModal: StagingConfirmModal | undefined = $state();
  let coinFlipChoiceModal: CoinFlipChoiceModal | undefined = $state();
  let requestModal: RequestActionModal | undefined = $state();
  let settingsModal: SettingsModal | undefined = $state();
  let debugModal: DebugModal | undefined = $state();

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

  // Card back is passed as a prop from DeckSelect

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

    // Resolve log message BEFORE action executes (card names may change post-move)
    const logMsg = describeAction(gameState, action, counterNameResolver);

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

    // Opponent zone check (game-universal, not plugin-specific)
    const opponentCheck = checkOpponentZone(snapshot, action);
    if (opponentCheck) {
      if (opponentCheck.shouldBlock) {
        gameLog(gameState, `Action blocked: ${opponentCheck.reason}`);
        gameState = { ...gameState };
        if (!p2p.isRemoteAction) playSfx('error');
        return opponentCheck.reason;
      }
      gameLog(gameState, `Warning: ${opponentCheck.reason}`);
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
    }

    // Auto-feedback (SFX + log) for local actions
    if (!p2p.isRemoteAction) {
      const sfx = ACTION_SFX_MAP[action.type];
      if (sfx) playSfx(sfx as any);
      if (logMsg) addLog(logMsg);
    }

    gameState = { ...gameState };

    // P2P: broadcast local actions to the remote peer
    // START_TURN is a local-only marker — each side fires it independently in advance()
    if (action.type !== ACTION_TYPES.START_TURN) {
      p2p.broadcastAction(action);
    }

    // P2P: after remote action, check if local machine needs to act
    if (p2p.isRemoteAction) advance();

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
    return {
      tryAction: (action: Action) => tryAction(action),
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
        if (playmatGridRef) await playmatGridRef.shuffleZone(zoneKey);
        // P2P: use a seeded shuffle so both peers get the same card order
        const shuffleAct = p2p.createSeededShuffle(playerIndex, zoneKey);
        tryAction(shuffleAct);
      },
      addLog: (message: string) => addLog(message),
      chooseFirstOrSecond: async (winner: 0 | 1, _results: boolean[]): Promise<0 | 1> => {
        const role = playerConfig[`player${winner}` as 'player0' | 'player1'];
        if (role === 'ai') {
          // AI always goes first
          return winner;
        } else if (role === 'local') {
          // Show choice UI, wait for human click
          return new Promise<0 | 1>((resolve) => { coinFlipChoiceModal?.show(winner, resolve); });
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
      if (gameConfig.loadDeck) {
        gameConfig.loadDeck(state, 0, deck1);
      } else {
        loadDeck(state, 0, `player1_${gameConfig.deckZoneId}`, deck1, gameConfig.getTemplate, false);
      }
    }
    if (gameConfig.playerCount === 2 && player2Deck && gameConfig.getTemplate) {
      if (gameConfig.loadDeck) {
        gameConfig.loadDeck(state, 1, player2Deck);
      } else {
        loadDeck(state, 1, `player2_${gameConfig.deckZoneId}`, player2Deck, gameConfig.getTemplate, false);
      }
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
      coinFlipChoiceModal?.show(winner, onChoice);
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
          } else {
            if (hasAI) playBgm();
            advance(); // dispatch if non-local player goes first
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
      endDrag();
      return;
    }

    const fromZoneKey = dragStore.current?.fromZoneKey;
    if (!fromZoneKey || (fromZoneKey === toZoneKey && position === undefined)) {
      endDrag();
      return;
    }

    const action = moveCard(playerFromZoneKey(toZoneKey), cardInstanceId, fromZoneKey, toZoneKey, position);
    endDrag();
    const blocked = tryAction(action);
    if (blocked) playSfx('error');
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
      tryAction(draw(local, 1));
      return;
    }

    const newVisibility = card.visibility[local] ? VISIBILITY.HIDDEN : VISIBILITY.PUBLIC;
    tryAction(flipCard(activePlayer, cardInstanceId, newVisibility));
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
    const isOwnDeck = isLocalZone(playerConfig, fromZone) && fromZone.endsWith('_deck');
    const destZone = settings.searchToHand && isOwnDeck
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
      setupTransitionComplete = false;
      lastStartTurnKey = '';
      previewCards = [];
      closeContextMenuStore();
      closeCardModalStore();
      if (hasAI) playBgm();
      advance();
    });
  }

  function handleDebug() {
    if (!gameState) return;
    // Snapshot strips Svelte 5 proxy — Object.entries() on proxied templates
    // may not enumerate all keys (e.g. rules[] on trainer cards).
    const snapshot = $state.snapshot(gameState);
    // Narrative: show AI perspective (opponent of local player)
    const aiIdx = opponent(local) as 0 | 1;
    const aiReadable = pluginManager.applyReadableStateModifier(toReadableState(snapshot, aiIdx));
    aiReadable.deckStrategy = decks?.[aiIdx]?.strategy;
    const debugNarrative = pluginManager.formatReadableState(aiReadable);
    // JSON: show active player's perspective
    const jsonReadable = pluginManager.applyReadableStateModifier(toReadableState(snapshot, snapshot.activePlayer));
    const debugJson = JSON.stringify(jsonReadable, null, 2);
    debugModal?.show(debugNarrative, debugJson);
  }

  function getToolContextDeps(): ToolContextDeps {
    return {
      getState: () => gameState!,
      getReadableState: (playerIndex) => {
        // Snapshot strips Svelte 5 proxy so Object.entries() enumerates all template fields
        const snapshot = $state.snapshot(gameState!);
        const aiIdx = playerIndex as 0 | 1;
        const modified = pluginManager.applyReadableStateModifier(toReadableState(snapshot, aiIdx));
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
      onPreviewCard: (card) => { previewCards = card ? [card] : []; },
      createCheckpoint: () => JSON.parse(JSON.stringify($state.snapshot(gameState!))),
      restoreState: (snapshot) => { gameState = snapshot as GameState<CardTemplate>; gameState = { ...gameState }; },
    };
  }

  type AIPhase = 'turn' | 'setup' | 'decision';

  async function runAIPhase(phase: AIPhase) {
    if (!gameState || !hasAI) return;

    const currentPlayer = phase === 'decision'
      ? (gameState.pendingDecision?.targetPlayer ?? gameState.activePlayer)
      : gameState.activePlayer;

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
    // advance() in the caller (via controllers[n].takeTurn) handles what comes next
  }

  function handleMulligan() {
    if (!gameState || !canLocalAct) return;
    tryAction(mulliganAction(actingPlayer));
  }

  function handleEndTurn() {
    if (!gameState || !canLocalAct || gameState.pendingDecision) return;

    // Check if staging has cards — prompt human player for confirmation
    const staging = gameState.zones['staging'];
    if (staging?.cards.length > 0 && isLocal(playerConfig, actingPlayer)) {
      stagingModal?.show([...staging.cards], () => {
        tryAction(endTurn(actingPlayer));
        advance();
      });
      return;
    }

    tryAction(endTurn(actingPlayer));
    advance();
  }

  function handleResolveDecision() {
    if (!gameState || !gameState.pendingDecision) return;
    tryAction(resolveDecision(local));

    // Unblock the AI's tool call if it was waiting
    if (pendingDecisionResolve) {
      pendingDecisionResolve();
      pendingDecisionResolve = null;
    }
    advance();
  }

  function handleRequestAction() {
    if (!gameState || turnFlow.tag !== 'local' || gameState.pendingDecision) return;
    requestModal?.show();
  }

  function handleRequestSubmit(value: string) {
    if (!gameState) return;
    const opp = opponent(local);
    tryAction(createDecision(local, opp, value || undefined));
    advance();
  }

  // Counter handlers
  function handleCounterDrop(counterId: string, cardInstanceId: string) {
    if (!gameState || !canLocalAct) return;
    const drag = counterDragStore.current;
    if (!drag) return;
    const isWidgetSource = drag.source.startsWith('widget:');
    const sourceCardId = !isWidgetSource && drag.source !== 'tray' ? drag.source : null;
    endCounterDrag();

    if (sourceCardId) {
      tryAction(removeCounter(local, sourceCardId, counterId, 1));
    }
    tryAction(addCounter(local, cardInstanceId, counterId, 1));

    // If dropped from energy zone widget, mark energy as attached
    if (isWidgetSource && gameState.pluginState) {
      const ps = gameState.pluginState as any;
      const zone = ps.energyZone?.[local];
      if (zone && !zone.attached) {
        zone.attached = true;
      }
    }
  }

  function handleCounterReturn() {
    if (!gameState || !canLocalAct) return;
    const drag = counterDragStore.current;
    if (!drag || drag.source === 'tray') { endCounterDrag(); return; }
    const { counterId, source: sourceCardId } = drag;
    endCounterDrag();

    tryAction(removeCounter(local, sourceCardId, counterId, 1));
  }

  function handleClearCounters() {
    if (!gameState || !contextMenu || !canLocalAct) return;
    const zone = gameState.zones[contextMenu.zoneKey];
    if (zone) {
      for (const card of zone.cards) {
        for (const counterType of Object.keys(card.counters)) {
          tryAction(setCounter(local, card.instanceId, counterType, 0));
        }
      }
    }
  }

  function handleSetOrientation(degrees: string) {
    if (!gameState || !contextMenu || !canLocalAct) return;
    const zone = gameState.zones[contextMenu.zoneKey];
    if (!zone || zone.cards.length === 0) return;
    const card = zone.cards.at(-1)!;
    tryAction(setOrientation(gameState.activePlayer, card.instanceId, degrees));
  }

  function handleRevealToOpponent() {
    if (!gameState || !contextMenu || !canLocalAct) return;

    const zoneKey = contextMenu.zoneKey;
    const err = tryAction(revealHand(local, zoneKey));
    if (err) return;
    advance();
  }

  /** Attach mousemove/mouseup listeners for a drag, guaranteeing cleanup even if onDrop throws. */
  function createDragSession(onMove: (e: MouseEvent) => void, onDrop: (e: MouseEvent) => void) {
    function handleMove(e: MouseEvent) { onMove(e); }
    function handleUp(e: MouseEvent) {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      try {
        onDrop(e);
      } finally {
        endDrag();
      }
    }
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }

  function handleMovePile() {
    if (!gameState || !contextMenu || !canLocalAct) return;
    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length === 0) return;

    const cards = [...zone.cards];
    const startX = contextMenu.x;
    const startY = contextMenu.y;
    closeContextMenuStore();
    startPileDrag(cards, zoneKey, startX, startY);

    createDragSession(
      (e) => updateDragPosition(e.clientX, e.clientY),
      (e) => {
        // Eat the subsequent click so the destination zone's browse handler doesn't fire
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
          if (fromZoneKey && pileCardIds && fromZoneKey !== toZoneKey) {
            const action = moveCardStack(playerFromZoneKey(toZoneKey), pileCardIds, fromZoneKey, toZoneKey);
            const blocked = tryAction(action);
            if (blocked) playSfx('error');
          }
        }
      },
    );
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
      <GameSidebar
        {gameState}
        {playerConfig}
        {turnFlow}
        {canLocalAct}
        {decisionTargetsHuman}
        {hasAI}
        {counterDefinitions}
        {markers}
        logEntries={logEntries}
        coinFlipIsFlipping={coinFlipRef?.isFlipping() ?? false}
        {onBackToMenu}
        onEndTurn={handleEndTurn}
        onMulligan={handleMulligan}
        onResolveDecision={handleResolveDecision}
        onRequest={handleRequestAction}
        onCoinFlip={handleManualCoinFlip}
        onDebug={handleDebug}
        onNew={resetGame}
        onSettings={() => settingsModal?.show()}
        onMarkerClick={handleMarkerClick}
        onCounterReturn={handleCounterReturn}
        onLogSubmit={addLog}
      />

      <div class="playmat-area">
        <PlaymatGrid
          bind:this={playmatGridRef}
          {playmat}
          {gameState}
          localPlayer={local}
          {cardBack}
          {counterDefinitions}
          {boardWidgets}
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

  <!-- Modals (self-managing visibility) -->
  <CoinFlipChoiceModal bind:this={coinFlipChoiceModal} />
  <StagingConfirmModal bind:this={stagingModal} />
  <RequestActionModal bind:this={requestModal} onSubmit={handleRequestSubmit} />
  <DebugModal bind:this={debugModal} />
  <SettingsModal bind:this={settingsModal} />
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


</style>
