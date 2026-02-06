<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playmat, CardInstance, CardTemplate, GameState, CounterDefinition, DeckList, ZoneConfig, Action } from '../../core';
  import { executeAction, shuffle, VISIBILITY, flipCard, endTurn, loadDeck, getCardName, findCardInZones, toReadableState, PluginManager, setOrientation, createDecision, resolveDecision, revealHand } from '../../core';
  import type { ToolContext } from '../../core/ai-tools';
  import { plugin, executeSetup, ZONE_IDS, pokemonHooksPlugin } from '../../plugins/pokemon';
  import { getTemplate } from '../../plugins/pokemon/cards';
  import PlaymatGrid from './PlaymatGrid.svelte';
  import ZoneContextMenu from './ZoneContextMenu.svelte';
  import ArrangeModal from './ArrangeModal.svelte';
  import DragOverlay from './DragOverlay.svelte';
  import CounterTray from './CounterTray.svelte';
  import CounterDragOverlay from './CounterDragOverlay.svelte';
  import CoinFlip from './CoinFlip.svelte';
  import ActionPanelView from './ActionPanelView.svelte';
  import { dragStore, startDrag, updateDragPosition, endDrag, executeDrop } from './dragState.svelte';
  import {
    counterDragStore,
    executeCounterDrop,
    executeCounterReturn,
    clearZoneCounters,
  } from './counterDragState.svelte';
  import { playSfx } from '../../lib/audio.svelte';
  import { runAITurn } from '../../ai';
  import agentsMd from '../../plugins/pokemon/agents.md?raw';
  // gameLog store no longer used - log lives in gameState.log
  import { contextMenuStore, openContextMenu, closeContextMenu as closeContextMenuStore } from './contextMenu.svelte';
  import { cardModalStore, openCardModal, closeCardModal as closeCardModalStore } from './cardModal.svelte';

  // Props
  interface Props {
    player1Deck: DeckList;
    player2Deck: DeckList;
    onBackToMenu?: () => void;
  }

  let { player1Deck, player2Deck, onBackToMenu }: Props = $props();

  // Plugin manager for warnings/hooks
  const pluginManager = new PluginManager<CardTemplate>();
  pluginManager.register(pokemonHooksPlugin as any);

  // Game state
  let gameState = $state<GameState<CardTemplate> | null>(null);
  let playmat = $state<Playmat | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let aiThinking = $state(false);
  let pendingDecisionResolve: (() => void) | null = $state(null);

  // Derived: is a decision targeting the human player?
  const decisionTargetsHuman = $derived(
    gameState?.pendingDecision?.targetPlayer === 0 ?? false
  );

  // Reactive drag state from external module
  const dragState = $derived(dragStore.current);
  const counterDragState = $derived(counterDragStore.current);

  // Counter definitions from plugin
  const counterDefinitions = $derived<CounterDefinition[]>(plugin.getCounterDefinitions?.() ?? []);

  // Action panels from plugin (for human player 0)
  const actionPanels = $derived(
    gameState && plugin.getActionPanels ? plugin.getActionPanels(gameState, 0) : []
  );

  function handleActionPanelClick(panelId: string, buttonId: string) {
    if (!gameState || !plugin.onActionPanelClick) return;
    plugin.onActionPanelClick(gameState, 0, panelId, buttonId);
    gameState = { ...gameState };
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

  // Auto-scroll log to bottom when new entries are added
  $effect(() => {
    if (gameLog.length > 0 && logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  // Auto-open browse modal when a reveal decision targets the human player
  $effect(() => {
    const decision = gameState?.pendingDecision;
    if (decision?.targetPlayer === 0 && decision.revealedZone && gameState) {
      const zoneKey = decision.revealedZone;
      const zone = gameState.zones[zoneKey];
      if (zone && zone.cards.length > 0) {
        const zoneName = zone.config.name ?? zoneKey;
        openCardModal({ cards: [...zone.cards], zoneKey, zoneName, position: 'all', mode: 'browse' });
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
    if (preResult.outcome === 'warn') {
      gameState.log.push(`Warning: ${preResult.reason}`);
    }

    const blocked = executeAction(gameState, action);
    gameState = { ...gameState };
    return blocked;
  }

  function handleCoinResult(result: 'heads' | 'tails') {
    const flipPlayer = gameState?.activePlayer ?? 0;
    addLog(`[Player ${flipPlayer + 1}] Coin flip: ${result === 'heads' ? 'HEADS' : 'TAILS'}`);
  }

  // Convert an Action to a log string for the game log panel. Returns null for silent actions.
  function describeAction(state: GameState<CardTemplate>, action: Action): string | null {
    const zoneId = (key: string) => key.split('_').slice(1).join('_');
    const cardName = (id: string) => getCardName(state, id);
    const counterName = (id: string) => getCounterById(id)?.name ?? id;

    switch (action.type) {
      case 'draw':
        return `[AI] Drew ${action.count} card(s)`;
      case 'move_card':
        return `[AI] Moved ${cardName(action.cardInstanceId)} from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
      case 'move_card_stack':
        return `[AI] Moved ${action.cardInstanceIds.length} cards from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
      case 'place_on_zone':
        return `[AI] Placed ${action.cardInstanceIds.length} card(s) on ${action.position} of ${zoneId(action.zoneId)}`;
      case 'shuffle':
        return `[AI] Shuffled ${zoneId(action.zoneId)}`;
      case 'flip_card':
        return `[AI] Flipped ${cardName(action.cardInstanceId)} ${action.newVisibility[0] ? 'face up' : 'face down'}`;
      case 'set_orientation':
        return action.orientation === '0'
          ? `[AI] ${cardName(action.cardInstanceId)} rotation cleared`
          : `[AI] ${cardName(action.cardInstanceId)} rotated to ${action.orientation}°`;
      case 'add_counter':
        return `[AI] Added ${action.amount}x ${counterName(action.counterType)} to ${cardName(action.cardInstanceId)}`;
      case 'remove_counter':
        return `[AI] Removed ${action.amount}x ${counterName(action.counterType)} from ${cardName(action.cardInstanceId)}`;
      case 'set_counter':
        return `[AI] Set ${counterName(action.counterType)} on ${cardName(action.cardInstanceId)} to ${action.value}`;
      case 'dice_roll':
        return `[AI] Rolled ${action.count}d${action.sides}`;
      case 'end_turn':
        return `[AI] Ended turn`;
      case 'concede':
        return `[AI] Conceded`;
      case 'declare_victory':
        return `[AI] Declared victory: ${action.reason ?? 'unknown'}`;
      case 'reveal':
        return `[AI] Revealed ${action.cardInstanceIds.map(id => cardName(id)).join(', ')}`;
      case 'peek':
        return `[AI] Peeked at ${action.count} cards from ${action.fromPosition} of ${zoneId(action.zoneId)}`;
      case 'reveal_hand':
        return `[AI] Revealed ${zoneId(action.zoneKey)}`;
      case 'create_decision':
        return `[AI] Requested decision: ${action.message ?? 'Action needed'}`;
      case 'resolve_decision':
        return `[AI] Resolved decision`;
      case 'coin_flip':
      case 'search_zone':
        return null;
      default:
        return null;
    }
  }

  onMount(async () => {
    try {
      playmat = await plugin.getPlaymat();
      gameState = await plugin.startGame();

      // Load player decks (replace the default deck)
      loadDeck(gameState, 0, `player0_${ZONE_IDS.DECK}`, player1Deck, getTemplate, false);
      loadDeck(gameState, 1, `player1_${ZONE_IDS.DECK}`, player2Deck, getTemplate, false);

      // Execute setup for both players (shuffle, draw 7, set prizes)
      executeSetup(gameState, 0);
      executeSetup(gameState, 1);

      gameState.log = ['Game started'];
      gameState = { ...gameState };
      loading = false;
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
      const toZoneName = gameState.zones[toZoneKey]?.config.name ?? toZoneKey;
      gameState.log.push(`[Player ${gameState.activePlayer + 1}] Moved ${cardName} from ${fromZoneName} to ${toZoneName}`);
      gameState = { ...gameState };
    }
  }

  function handlePreview(card: CardInstance<CardTemplate>) {
    if (card.visibility[0]) {
      previewCard = card;
    }
  }

  function handleToggleVisibility(cardInstanceId: string) {
    if (!gameState) return;

    const result = findCardInZones(gameState, cardInstanceId);
    if (!result) return;

    const { card } = result;
    const newVisibility = card.visibility[0] ? VISIBILITY.HIDDEN : VISIBILITY.PUBLIC;
    const activePlayer = gameState.activePlayer;
    executeAction(gameState, flipCard(activePlayer, cardInstanceId, newVisibility));
    const flipDirection = newVisibility === VISIBILITY.PUBLIC ? 'face up' : 'face down';
    gameState.log.push(`[Player ${activePlayer + 1}] Flipped ${card.template.name} ${flipDirection}`);
    gameState = { ...gameState };
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
    if (!gameState || !contextMenu || !playmatGridRef) return;

    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length < 2) return;

    // Play shuffle sound
    playSfx('shuffle');

    // Run animation via PlaymatGrid
    await playmatGridRef.shuffleZone(zoneKey);

    // Execute actual shuffle after animation completes
    const playerIndex = zoneKey.startsWith('player0_') ? 0 : 1;
    const action = shuffle(playerIndex, zoneKey);
    executeAction(gameState, action);
    const zoneName = gameState.zones[zoneKey]?.config.name ?? zoneKey;
    gameState.log.push(`[Player ${gameState.activePlayer + 1}] Shuffled ${zoneName}`);
    gameState = { ...gameState };
  }

  function handleCardModal(mode: 'peek' | 'arrange', position: 'top' | 'bottom', count: number) {
    if (!contextMenu || !gameState) return;
    const zoneCards = gameState.zones[contextMenu.zoneKey]?.cards ?? [];
    // top = last cards in array (highest z-index), bottom = first cards
    const cards = position === 'top' ? zoneCards.slice(-count) : zoneCards.slice(0, count);
    openCardModal({ cards, zoneKey: contextMenu.zoneKey, zoneName: contextMenu.zoneName, position, mode });
  }

  function handleViewAll() {
    if (!contextMenu || !gameState) return;
    const zoneCards = gameState.zones[contextMenu.zoneKey]?.cards ?? [];
    if (zoneCards.length === 0) return;
    openCardModal({ cards: [...zoneCards], zoneKey: contextMenu.zoneKey, zoneName: contextMenu.zoneName, position: 'all', mode: 'peek' });
  }

  function handleArrangeAll() {
    if (!contextMenu || !gameState) return;
    const zoneCards = gameState.zones[contextMenu.zoneKey]?.cards ?? [];
    if (zoneCards.length < 2) return;
    openCardModal({ cards: [...zoneCards], zoneKey: contextMenu.zoneKey, zoneName: contextMenu.zoneName, position: 'all', mode: 'arrange' });
  }

  function handleBrowseZone(zoneKey: string, zoneName: string) {
    if (!gameState) return;
    const zoneCards = gameState.zones[zoneKey]?.cards ?? [];
    if (zoneCards.length === 0) return;
    openCardModal({ cards: [...zoneCards], zoneKey, zoneName, position: 'all', mode: 'browse' });
  }

  function handleModalDragOut(card: CardInstance<CardTemplate>, fromZoneKey: string, mouseX: number, mouseY: number) {
    closeCardModalStore();
    startDrag(card, fromZoneKey, mouseX, mouseY);

    // Mouse-based drag: temporary listeners drive the same drag system
    function onMouseMove(e: MouseEvent) {
      updateDragPosition(e.clientX, e.clientY);
    }
    function onMouseUp(e: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Find zone under cursor via data-zone-key attribute
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = el?.closest('[data-zone-key]') as HTMLElement | null;
      if (zoneEl && gameState) {
        const toZoneKey = zoneEl.dataset.zoneKey!;
        const isHandZone = toZoneKey.includes('hand');
        handleDrop(card.instanceId, toZoneKey, isHandZone ? undefined : 0);
      }
      endDrag();
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleCardModalConfirm(reorderedCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !cardModal) return;

    const zone = gameState.zones[cardModal.zoneKey];
    if (!zone) return;

    const count = reorderedCards.length;

    if (cardModal.position === 'all') {
      // Replace entire zone contents
      zone.cards = reorderedCards;
    } else if (cardModal.position === 'top') {
      zone.cards.splice(-count, count, ...reorderedCards);
    } else {
      zone.cards.splice(0, count, ...reorderedCards);
    }

    gameState = { ...gameState };
    closeCardModalStore();
  }

  function handleCloseCardModal() {
    playSfx('cancel');
    closeCardModalStore();
  }

  function resetGame() {
    plugin.startGame().then((state) => {
      // Load player decks
      loadDeck(state, 0, `player0_${ZONE_IDS.DECK}`, player1Deck, getTemplate, false);
      loadDeck(state, 1, `player1_${ZONE_IDS.DECK}`, player2Deck, getTemplate, false);

      // Execute setup for both players
      executeSetup(state, 0);
      executeSetup(state, 1);

      state.log = ['Game started'];
      gameState = state;
      previewCard = null;
      closeContextMenuStore();
      closeCardModalStore();
    });
  }

  function handleBackToMenu() {
    playSfx('cancel');
    onBackToMenu?.();
  }

  // Debug modal
  let showDebugModal = $state(false);
  let debugJson = $state('');

  function handleDebug() {
    if (!gameState) return;
    const readable = pluginManager.applyReadableStateModifier(toReadableState(gameState, gameState.activePlayer));
    debugJson = JSON.stringify(readable, null, 2);
    showDebugModal = true;
  }

  /**
   * Build a ToolContext for the AI player with serialized execution,
   * visual feedback, and decision blocking support.
   */
  function buildAIContext(options?: { isDecisionResponse?: boolean }): { ctx: ToolContext; waitForQueue: () => Promise<void> } {
    let queue: Promise<void> = Promise.resolve();

    const ctx: ToolContext = {
      playerIndex: 1,
      isDecisionResponse: options?.isDecisionResponse,
      getState: () => gameState!,
      getReadableState: () => JSON.stringify(
        pluginManager.applyReadableStateModifier(toReadableState(gameState!, 1))
      ),
      execute: (action) => {
        const result = queue.then(async () => {
          action.source = 'ai';

          // Special case: coin_flip uses visual CoinFlip animation
          if (action.type === 'coin_flip' && coinFlipRef) {
            const results: boolean[] = [];
            for (let i = 0; i < action.count; i++) {
              const isHeads = Math.random() < 0.5;
              results.push(isHeads);
              await coinFlipRef.flip(isHeads);
            }
            action.results = results;
            tryAction(action);
            return JSON.stringify({
              coin_flip_results: results.map(r => r ? 'heads' : 'tails'),
              state: JSON.parse(ctx.getReadableState()),
            });
          }

          // Resolve log message BEFORE action executes (card names may change post-move)
          const logMessage = gameState ? describeAction(gameState, action) : null;

          const blocked = tryAction(action);
          if (blocked) return JSON.stringify({ blocked });

          // Log the action
          if (logMessage) addLog(logMessage);

          // SFX based on action type
          const sfxMap: Record<string, Parameters<typeof playSfx>[0]> = {
            draw: 'cardDrop',
            move_card: 'cardDrop',
            move_card_stack: 'cardDrop',
            shuffle: 'shuffle',
            end_turn: 'confirm',
            add_counter: 'cursor',
            remove_counter: 'cursor',
            set_counter: 'cursor',
          };
          const sfx = sfxMap[action.type];
          if (sfx) playSfx(sfx);

          // If AI created a decision targeting human (player 0), block until human resolves
          if ((action.type === 'create_decision' || action.type === 'reveal_hand') && gameState?.pendingDecision?.targetPlayer === 0) {
            await new Promise<void>(resolve => {
              pendingDecisionResolve = resolve;
            });
          }

          // Delay for visual feedback
          await new Promise(r => setTimeout(r, 500));
          return ctx.getReadableState();
        });
        queue = result.then(() => {}, () => {});
        return result;
      },
    };

    return { ctx, waitForQueue: () => queue };
  }

  async function triggerAITurn() {
    if (!gameState || gameState.activePlayer !== 1 || aiThinking) return;
    const apiKey = import.meta.env.VITE_FIREWORKS_API_KEY;
    if (!apiKey) return;
    aiThinking = true;
    addLog('[AI] Thinking...');

    const { ctx } = buildAIContext();

    try {
      await runAITurn({
        context: ctx,
        plugin,
        heuristics: agentsMd,
        apiKey,
        logging: true,
      });
    } catch (e) {
      addLog(`[AI] Error: ${e}`);
    }
    aiThinking = false;
  }

  /**
   * Trigger a decision mini-turn for the AI (human created the decision).
   */
  async function triggerAIDecisionTurn() {
    if (!gameState || aiThinking) return;
    const apiKey = import.meta.env.VITE_FIREWORKS_API_KEY;
    if (!apiKey) return;
    aiThinking = true;
    addLog('[AI] Responding to decision...');

    const { ctx } = buildAIContext({ isDecisionResponse: true });

    try {
      await runAITurn({
        context: ctx,
        plugin,
        heuristics: agentsMd,
        apiKey,
        logging: true,
        decisionMode: true,
      });
    } catch (e) {
      addLog(`[AI] Error: ${e}`);
    }

    // Safety net: if AI didn't call resolve_decision, auto-resolve
    if (gameState?.pendingDecision) {
      executeAction(gameState, resolveDecision(1));
      gameState = { ...gameState };
      addLog('[AI] Decision auto-resolved (AI did not call resolve_decision)');
    }

    aiThinking = false;
  }

  function handleEndTurn() {
    if (!gameState) return;
    const currentPlayer = gameState.activePlayer;
    const action = endTurn(currentPlayer);
    executeAction(gameState, action);
    gameState.log.push(`[Player ${currentPlayer + 1}] Ended turn`);
    gameState = { ...gameState };
    playSfx('confirm');

    // If it's now the AI's turn, trigger it
    triggerAITurn();
  }

  function handleResolveDecision() {
    if (!gameState || !gameState.pendingDecision) return;
    executeAction(gameState, resolveDecision(0));
    gameState = { ...gameState };
    playSfx('confirm');

    // Unblock the AI's tool call if it was waiting
    if (pendingDecisionResolve) {
      pendingDecisionResolve();
      pendingDecisionResolve = null;
    }
  }

  function handleRequestAction() {
    if (!gameState || aiThinking || gameState.pendingDecision) return;
    const message = prompt('Describe what the opponent should do (optional):');
    if (message === null) return; // cancelled
    executeAction(gameState, createDecision(0, 1, message || undefined));
    gameState = { ...gameState };
    playSfx('confirm');

    // Trigger AI decision mini-turn
    triggerAIDecisionTurn();
  }

  // Counter handlers
  function handleCounterDrop(counterId: string, cardInstanceId: string) {
    if (!gameState) return;
    const updatedState = executeCounterDrop(counterId, cardInstanceId, gameState);
    if (updatedState) {
      gameState = updatedState;
      const cardName = getCardName(gameState, cardInstanceId);
      const counter = getCounterById(counterId);
      gameState.log.push(`Added ${counter?.name ?? counterId} to ${cardName}`);
      gameState = { ...gameState };
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
      gameState.log.push(`Removed ${counter?.name ?? counterId} from ${cardName}`);
      gameState = { ...gameState };
    }
  }

  function handleClearCounters() {
    if (!gameState || !contextMenu) return;
    const zoneKey = contextMenu.zoneKey;
    const zoneName = contextMenu.zoneName;
    gameState = clearZoneCounters(zoneKey, gameState);
    gameState.log.push(`Cleared all counters from ${zoneName}`);
    gameState = { ...gameState };
    playSfx('confirm');
  }

  function handleSetOrientation(degrees: string) {
    if (!gameState || !contextMenu) return;
    const zone = gameState.zones[contextMenu.zoneKey];
    if (!zone || zone.cards.length === 0) return;
    const card = zone.cards.at(-1)!;
    executeAction(gameState, setOrientation(gameState.activePlayer, card.instanceId, degrees));
    const label = degrees === '0' ? 'rotation cleared' : `rotated to ${degrees}°`;
    gameState.log.push(`[Player ${gameState.activePlayer + 1}] ${card.template.name} ${label}`);
    gameState = { ...gameState };
    playSfx('confirm');
  }

  function handleRevealToOpponent() {
    if (!gameState || !contextMenu || gameState.pendingDecision) return;
    const zoneKey = contextMenu.zoneKey;
    executeAction(gameState, revealHand(0, zoneKey));
    gameState = { ...gameState };
    playSfx('confirm');

    // If AI is the target, trigger a decision mini-turn
    if (gameState.pendingDecision?.targetPlayer === 1) {
      triggerAIDecisionTurn();
    }
  }
</script>

<div class="game-container font-retro bg-gbc-bg min-h-screen w-screen p-4 box-border relative overflow-auto">
  <div class="scanlines"></div>

  <div class="game-content">
  <header class="gbc-panel text-center mb-4 flex items-center justify-between px-4">
    <div class="flex-1 flex justify-start">
      {#if gameState}
        <div class="turn-info text-[0.5rem]">
          <span class="text-gbc-light">TURN</span>
          <span class="text-gbc-yellow ml-1">{gameState.turnNumber}</span>
          <span class="text-gbc-light ml-2">PLAYER</span>
          <span class="text-gbc-green ml-1">{gameState.activePlayer + 1}</span>
          {#if aiThinking}
            <span class="text-gbc-red ml-2 animate-pulse">AI THINKING...</span>
          {/if}
        </div>
      {/if}
    </div>
    <h1 class="text-gbc-yellow text-xl max-sm:text-sm m-0 tracking-wide title-shadow">
      {playmat?.name ?? 'LOADING...'}
    </h1>
    <div class="flex-1 flex justify-end gap-2">
      {#if decisionTargetsHuman}
        <button
          class="gbc-btn text-[0.5rem] py-1 px-3"
          onclick={handleResolveDecision}
          disabled={!gameState}
        >
          RESOLVE DECISION
        </button>
      {:else}
        <button
          class="gbc-btn text-[0.5rem] py-1 px-3"
          onclick={handleEndTurn}
          disabled={!gameState || aiThinking}
        >
          END TURN
        </button>
      {/if}
      <button
        class="gbc-btn text-[0.5rem] py-1 px-3"
        onclick={handleRequestAction}
        disabled={!gameState || aiThinking || !!gameState?.pendingDecision}
      >
        REQUEST ACTION
      </button>
      <button
        class="gbc-btn text-[0.5rem] py-1 px-3"
        onclick={() => coinFlipRef?.flip()}
        disabled={coinFlipRef?.isFlipping()}
      >
        FLIP COIN
      </button>
      <button class="gbc-btn text-[0.5rem] py-1 px-3" onclick={handleDebug} disabled={!gameState}>
        DEBUG
      </button>
      <button class="gbc-btn text-[0.5rem] py-1 px-3" onclick={resetGame}>
        NEW GAME
      </button>
      {#if onBackToMenu}
        <button class="gbc-btn text-[0.5rem] py-1 px-3" onclick={handleBackToMenu}>
          MENU
        </button>
      {/if}
    </div>
  </header>

  {#if decisionTargetsHuman && gameState?.pendingDecision}
    <div class="gbc-panel text-center mb-2 py-2 px-4 bg-gbc-red/20 border-gbc-red">
      <span class="text-gbc-yellow text-[0.5rem] font-retro">
        DECISION: {gameState.pendingDecision.message ?? 'Your opponent requests an action'}
      </span>
    </div>
  {/if}

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
      <div class="playmat-area">
        <PlaymatGrid
          bind:this={playmatGridRef}
          {playmat}
          {gameState}
          {cardBack}
          {counterDefinitions}
          onDrop={handleDrop}
          onPreview={handlePreview}
          onToggleVisibility={handleToggleVisibility}
          onZoneContextMenu={handleZoneContextMenu}
          onCounterDrop={handleCounterDrop}
          onBrowse={handleBrowseZone}
        />
      </div>

      <div class="sidebar">
        <div class="gbc-panel preview-panel">
          <div class="text-gbc-yellow text-[0.5rem] text-center mb-3 py-1 px-2 bg-gbc-border">PREVIEW</div>
          {#if previewCard && previewCard.visibility[0]}
            <div class="preview-card">
              {#if previewCard.template.imageUrl}
                <img src={previewCard.template.imageUrl} alt={previewCard.template.name} class="preview-image" />
              {/if}
            </div>
          {:else if previewCard}
            <div class="preview-card face-down">
              <div class="back-pattern"></div>
            </div>
          {:else}
            <div class="preview-placeholder"></div>
          {/if}
        </div>

        {#if actionPanels.length > 0}
          <ActionPanelView
            panels={actionPanels}
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
          <div class="text-gbc-yellow text-[0.5rem] text-center mb-2 py-1 px-2 bg-gbc-border">LOG</div>
          <div class="log-content" bind:this={logContainer}>
            {#each gameLog as entry}
              <div class="log-entry text-[0.45rem] text-gbc-light">{entry}</div>
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
      onPeekTop={(count) => handleCardModal('peek', 'top', count)}
      onPeekBottom={(count) => handleCardModal('peek', 'bottom', count)}
      onArrangeTop={(count) => handleCardModal('arrange', 'top', count)}
      onArrangeBottom={(count) => handleCardModal('arrange', 'bottom', count)}
      onViewAll={handleViewAll}
      onArrangeAll={handleArrangeAll}
      onClearCounters={handleClearCounters}
      onSetOrientation={handleSetOrientation}
      onRevealToOpponent={contextMenu.zoneKey.startsWith('player0_') && !gameState?.pendingDecision ? handleRevealToOpponent : undefined}
      onClose={handleCloseContextMenu}
    />
  {/if}

  <!-- Card Modal (Peek/Arrange) -->
  {#if cardModal}
    <ArrangeModal
      cards={cardModal.cards}
      zoneName={cardModal.zoneName}
      position={cardModal.position}
      mode={cardModal.mode}
      zoneKey={cardModal.zoneKey}
      {cardBack}
      onConfirm={handleCardModalConfirm}
      onDragOut={cardModal.mode === 'browse' ? handleModalDragOut : undefined}
      onClose={handleCloseCardModal}
    />
  {/if}

  <!-- Drag Overlay -->
  {#if dragState}
    <DragOverlay
      card={dragState.card}
      x={dragState.mouseX}
      y={dragState.mouseY}
      {cardBack}
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

  <!-- Coin Flip Modal -->
  <CoinFlip
    bind:this={coinFlipRef}
    coinFront={plugin.getCoinFront?.() ?? ''}
    coinBack={plugin.getCoinBack?.() ?? ''}
    onResult={handleCoinResult}
  />

  <!-- Debug Modal -->
  {#if showDebugModal}
    <div class="debug-overlay" onclick={() => showDebugModal = false} onkeydown={(e) => e.key === 'Escape' && (showDebugModal = false)} role="button" tabindex="-1">
      <div class="debug-modal gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
        <div class="flex items-center justify-between mb-2 py-1 px-2 bg-gbc-border">
          <span class="text-gbc-yellow text-[0.5rem]">READABLE STATE</span>
          <button class="gbc-btn text-[0.45rem] py-0.5 px-2" onclick={() => showDebugModal = false}>CLOSE</button>
        </div>
        <pre class="debug-json">{debugJson}</pre>
      </div>
    </div>
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

  .turn-info {
    @apply font-retro tracking-wide;
  }

  .game-content {
    @apply w-fit mx-auto;
  }

  .game-layout {
    @apply flex items-start;
    gap: 0.5rem;
    @apply max-lg:flex-col max-lg:items-center;
  }

  .playmat-area {
    @apply overflow-auto;
  }

  .sidebar {
    @apply flex flex-col gap-4 shrink-0;
    width: 20rem;
    @apply max-lg:w-full max-lg:flex-row max-lg:flex-wrap max-lg:justify-center;
  }

  .preview-panel {
    @apply max-lg:w-auto;
  }

  .log-panel {
    @apply max-lg:w-auto flex flex-col;
    height: 28rem;
  }

  .log-content {
    @apply overflow-y-auto px-2 flex-1;
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
    @apply w-full bg-gbc-dark-green text-gbc-light text-[0.45rem] px-2 py-1 border border-gbc-border rounded-sm;
    @apply outline-none;
  }

  .log-input::placeholder {
    @apply text-gbc-green/50;
  }

  .log-input:focus {
    @apply border-gbc-green;
  }

  .preview-card {
    width: 18rem;
    aspect-ratio: 5 / 7;
    @apply rounded-xl border-4 border-gbc-border;
    @apply flex flex-col items-center justify-center;
    @apply bg-gbc-cream overflow-hidden;
  }

  .preview-card.face-down {
    @apply bg-gbc-blue;
  }

  .preview-image {
    @apply w-full h-auto;
  }

  .preview-card.face-down .back-pattern {
    @apply w-[85%] h-[90%] rounded-lg border-4 border-gbc-cream;
    background: repeating-linear-gradient(
      45deg,
      var(--color-gbc-dark-green),
      var(--color-gbc-dark-green) 0.5rem,
      var(--color-gbc-blue) 0.5rem,
      var(--color-gbc-blue) 1rem
    );
  }

  .preview-placeholder {
    width: 18rem;
    aspect-ratio: 5 / 7;
    @apply rounded-xl bg-gbc-border opacity-30;
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
