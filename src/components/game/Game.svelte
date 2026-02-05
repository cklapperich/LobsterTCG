<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playmat, CardInstance, CardTemplate, GameState, CounterDefinition, DeckList } from '../../core';
  import { executeAction, shuffle, VISIBILITY, flipCard, parseZoneKey, endTurn, loadDeck } from '../../core';
  import { plugin, executeSetup, ZONE_IDS } from '../../plugins/pokemon';
  import { getTemplate } from '../../plugins/pokemon/cards';
  import PlaymatGrid from './PlaymatGrid.svelte';
  import ZoneContextMenu from './ZoneContextMenu.svelte';
  import ArrangeModal from './ArrangeModal.svelte';
  import DragOverlay from './DragOverlay.svelte';
  import CounterTray from './CounterTray.svelte';
  import CounterDragOverlay from './CounterDragOverlay.svelte';
  import { dragStore, executeDrop } from './dragState.svelte';
  import {
    counterDragStore,
    executeCounterDrop,
    executeCounterReturn,
    clearZoneCounters,
  } from './counterDragState.svelte';
  import { playSfx } from '../../lib/audio.svelte';

  // Props
  interface Props {
    player1Deck: DeckList;
    player2Deck: DeckList;
    onBackToMenu?: () => void;
  }

  let { player1Deck, player2Deck, onBackToMenu }: Props = $props();

  // Game state
  let gameState = $state<GameState<CardTemplate> | null>(null);
  let playmat = $state<Playmat | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Reactive drag state from external module
  const dragState = $derived(dragStore.current);
  const counterDragState = $derived(counterDragStore.current);

  // Counter definitions from plugin
  const counterDefinitions = $derived<CounterDefinition[]>(plugin.getCounterDefinitions?.() ?? []);

  // Get counter definition by ID
  function getCounterById(id: string): CounterDefinition | undefined {
    return counterDefinitions.find((c) => c.id === id);
  }

  // Preview state
  let previewCard = $state<CardInstance<CardTemplate> | null>(null);

  // Game log state
  let gameLog = $state<string[]>([]);
  let logContainer = $state<HTMLDivElement | null>(null);

  function addLogEntry(message: string) {
    gameLog = [...gameLog, message];
  }

  // Auto-scroll log to bottom when new entries are added
  $effect(() => {
    if (gameLog.length > 0 && logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  // Context menu state
  let contextMenu = $state<{
    zoneKey: string;
    zoneName: string;
    cardCount: number;
    x: number;
    y: number;
  } | null>(null);

  // Shuffle animation state
  let shufflingZoneKey = $state<string | null>(null);
  let shufflePacketStart = $state(-1);
  const PACKET_SIZE = 12;
  const SHUFFLE_REPS = 4;

  // Card modal state (unified for peek and arrange)
  let cardModal = $state<{
    cards: CardInstance<CardTemplate>[];
    zoneKey: string;
    zoneName: string;
    position: 'top' | 'bottom';
    mode: 'peek' | 'arrange';
  } | null>(null);

  // Card back from plugin
  const cardBack = plugin.getCardBack?.() ?? '';

  // Coin images from plugin
  const coinFront = plugin.getCoinFront?.() ?? '';
  const coinBackImg = plugin.getCoinBack?.() ?? '';

  // Coin flip state
  let coinFlipping = $state(false);
  let coinResult = $state<'heads' | 'tails' | null>(null);
  let coinShowingFront = $state(true);

  async function handleCoinFlip() {
    if (coinFlipping) return;

    // Reset state and start animation
    coinFlipping = true;
    coinResult = null;

    // Play initial toss sound
    playSfx('coinToss');

    // Determine result randomly
    const isHeads = Math.random() < 0.5;

    // Animate several flips (12 half-rotations over ~1.5 seconds)
    const flipCount = 12;
    const baseDelay = 80;

    for (let i = 0; i < flipCount; i++) {
      coinShowingFront = !coinShowingFront;
      // Slow down towards the end
      const delay = baseDelay + (i > flipCount - 4 ? (i - (flipCount - 4)) * 40 : 0);
      await new Promise(r => setTimeout(r, delay));
    }

    // Set final result
    coinResult = isHeads ? 'heads' : 'tails';
    coinShowingFront = isHeads;

    // Play result sound
    playSfx(isHeads ? 'coinHeads' : 'coinTails');

    // Log the result
    const flipPlayer = gameState?.activePlayer ?? 0;
    addLogEntry(`[Player ${flipPlayer + 1}] Coin flip: ${isHeads ? 'HEADS' : 'TAILS'}`);

    // Keep result visible briefly, then reset
    await new Promise(r => setTimeout(r, 800));
    coinFlipping = false;
  }

  onMount(async () => {
    try {
      playmat = await plugin.getPlaymat();
      gameState = await plugin.startGame();

      // Load player decks (replace the default deck)
      loadDeck(gameState, 0, ZONE_IDS.DECK, player1Deck, getTemplate, false);
      loadDeck(gameState, 1, ZONE_IDS.DECK, player2Deck, getTemplate, false);

      // Execute setup for both players (shuffle, draw 7, set prizes)
      executeSetup(gameState, 0);
      executeSetup(gameState, 1);

      gameState = { ...gameState };
      gameLog = ['Game started'];
      loading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load game';
      loading = false;
    }
  });

  function handleDrop(cardInstanceId: string, toZoneKey: string, position?: number) {
    if (!gameState) return;

    // Find the card and source zone for logging
    let cardName = 'Card';
    for (const zone of Object.values(gameState.zones)) {
      const card = zone.cards.find((c) => c.instanceId === cardInstanceId);
      if (card) {
        cardName = card.template.name;
        break;
      }
    }

    const updatedState = executeDrop(cardInstanceId, toZoneKey, gameState, position);
    if (updatedState) {
      gameState = updatedState;
      // Get zone name and player for logging
      const { playerIndex, zoneId } = parseZoneKey(toZoneKey);
      addLogEntry(`[Player ${playerIndex + 1}] Moved ${cardName} to ${zoneId}`);
    }
  }

  function handlePreview(card: CardInstance<CardTemplate>) {
    previewCard = card;
  }

  function handleToggleVisibility(cardInstanceId: string) {
    if (!gameState) return;

    for (const zone of Object.values(gameState.zones)) {
      const card = zone.cards.find((c) => c.instanceId === cardInstanceId);
      if (card) {
        const newVisibility = card.visibility[0]
          ? VISIBILITY.HIDDEN
          : VISIBILITY.PUBLIC;
        const activePlayer = gameState.activePlayer;
        const action = flipCard(activePlayer, cardInstanceId, newVisibility);
        executeAction(gameState, action);
        gameState = { ...gameState };
        const flipDirection = newVisibility === VISIBILITY.PUBLIC ? 'face up' : 'face down';
        addLogEntry(`[Player ${activePlayer + 1}] Flipped ${card.template.name} ${flipDirection}`);
        break;
      }
    }
  }

  // Context menu handlers
  function handleZoneContextMenu(zoneKey: string, zoneName: string, cardCount: number, x: number, y: number) {
    contextMenu = { zoneKey, zoneName, cardCount, x, y };
  }

  function closeContextMenu() {
    playSfx('cancel');
    contextMenu = null;
  }

  async function handleShuffle() {
    if (!gameState || !contextMenu) return;

    const zoneKey = contextMenu.zoneKey;
    const zone = gameState.zones[zoneKey];
    if (!zone || zone.cards.length < 2) return;

    // Play shuffle sound
    playSfx('shuffle');

    // Start animation
    shufflingZoneKey = zoneKey;

    // Do multiple overhand motions
    for (let rep = 0; rep < SHUFFLE_REPS; rep++) {
      // Mark which cards are in the current packet (top cards)
      shufflePacketStart = Math.max(0, zone.cards.length - PACKET_SIZE);

      // Wait for animation
      await new Promise(r => setTimeout(r, 300));

      shufflePacketStart = -1;
      await new Promise(r => setTimeout(r, 100)); // Brief pause between reps
    }

    // Execute actual shuffle
    const { playerIndex, zoneId } = parseZoneKey(zoneKey);
    const action = shuffle(playerIndex, zoneId);
    executeAction(gameState, action);
    gameState = { ...gameState };
    addLogEntry(`[Player ${playerIndex + 1}] Shuffled ${zoneId}`);

    // Clear animation state
    shufflingZoneKey = null;
  }

  function handleCardModal(mode: 'peek' | 'arrange', position: 'top' | 'bottom', count: number) {
    if (!contextMenu || !gameState) return;
    const zoneCards = gameState.zones[contextMenu.zoneKey]?.cards ?? [];
    // top = last cards in array (highest z-index), bottom = first cards
    const cards = position === 'top' ? zoneCards.slice(-count) : zoneCards.slice(0, count);
    cardModal = { cards, zoneKey: contextMenu.zoneKey, zoneName: contextMenu.zoneName, position, mode };
  }

  function handleCardModalConfirm(reorderedCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !cardModal) return;

    const zone = gameState.zones[cardModal.zoneKey];
    if (!zone) return;

    const count = reorderedCards.length;

    if (cardModal.position === 'top') {
      zone.cards.splice(-count, count, ...reorderedCards);
    } else {
      zone.cards.splice(0, count, ...reorderedCards);
    }

    gameState = { ...gameState };
    cardModal = null;
  }

  function closeCardModal() {
    playSfx('cancel');
    cardModal = null;
  }

  function resetGame() {
    plugin.startGame().then((state) => {
      // Load player decks
      loadDeck(state, 0, ZONE_IDS.DECK, player1Deck, getTemplate, false);
      loadDeck(state, 1, ZONE_IDS.DECK, player2Deck, getTemplate, false);

      // Execute setup for both players
      executeSetup(state, 0);
      executeSetup(state, 1);

      gameState = state;
      previewCard = null;
      contextMenu = null;
      cardModal = null;
      gameLog = ['Game started'];
    });
  }

  function handleBackToMenu() {
    playSfx('cancel');
    onBackToMenu?.();
  }

  function handleEndTurn() {
    if (!gameState) return;
    const currentPlayer = gameState.activePlayer;
    const action = endTurn(currentPlayer);
    executeAction(gameState, action);
    gameState = { ...gameState };
    addLogEntry(`[Player ${currentPlayer + 1}] Ended turn`);
    playSfx('confirm');
  }

  // Counter handlers
  function handleCounterDrop(counterId: string, cardInstanceId: string) {
    if (!gameState) return;
    const updatedState = executeCounterDrop(counterId, cardInstanceId, gameState);
    if (updatedState) {
      gameState = updatedState;
      // Find the card name for logging
      let cardName = 'Card';
      for (const zone of Object.values(gameState.zones)) {
        const card = zone.cards.find((c) => c.instanceId === cardInstanceId);
        if (card) {
          cardName = card.template.name;
          break;
        }
      }
      const counter = getCounterById(counterId);
      addLogEntry(`Added ${counter?.name ?? counterId} to ${cardName}`);
    }
  }

  function handleCounterReturn() {
    if (!gameState) return;
    const counterId = counterDragStore.current?.counterId;
    const sourceCardId = counterDragStore.current?.source;
    const updatedState = executeCounterReturn(gameState);
    if (updatedState && sourceCardId && sourceCardId !== 'tray') {
      gameState = updatedState;
      // Find the card name for logging
      let cardName = 'Card';
      for (const zone of Object.values(gameState.zones)) {
        const card = zone.cards.find((c) => c.instanceId === sourceCardId);
        if (card) {
          cardName = card.template.name;
          break;
        }
      }
      const counter = getCounterById(counterId ?? '');
      addLogEntry(`Removed ${counter?.name ?? counterId} from ${cardName}`);
    }
  }

  function handleClearCounters() {
    if (!gameState || !contextMenu) return;
    const zoneKey = contextMenu.zoneKey;
    const zoneName = contextMenu.zoneName;
    gameState = clearZoneCounters(zoneKey, gameState);
    addLogEntry(`Cleared all counters from ${zoneName}`);
    playSfx('confirm');
  }
</script>

<div class="game-container font-retro bg-gbc-bg min-h-screen w-screen p-4 box-border relative overflow-auto">
  <div class="scanlines"></div>

  <header class="gbc-panel text-center mb-4 flex items-center justify-between px-4">
    <div class="flex-1 flex justify-start">
      {#if gameState}
        <div class="turn-info text-[0.5rem]">
          <span class="text-gbc-light">TURN</span>
          <span class="text-gbc-yellow ml-1">{gameState.turnNumber}</span>
          <span class="text-gbc-light ml-2">PLAYER</span>
          <span class="text-gbc-green ml-1">{gameState.activePlayer + 1}</span>
        </div>
      {/if}
    </div>
    <h1 class="text-gbc-yellow text-xl max-sm:text-sm m-0 tracking-wide title-shadow">
      {playmat?.name ?? 'LOADING...'}
    </h1>
    <div class="flex-1 flex justify-end gap-2">
      <button
        class="gbc-btn text-[0.5rem] py-1 px-3"
        onclick={handleEndTurn}
        disabled={!gameState}
      >
        END TURN
      </button>
      <button
        class="gbc-btn text-[0.5rem] py-1 px-3"
        onclick={handleCoinFlip}
        disabled={coinFlipping}
      >
        FLIP COIN
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
          {playmat}
          {gameState}
          {cardBack}
          {counterDefinitions}
          {shufflingZoneKey}
          {shufflePacketStart}
          onDrop={handleDrop}
          onPreview={handlePreview}
          onToggleVisibility={handleToggleVisibility}
          onZoneContextMenu={handleZoneContextMenu}
          onCounterDrop={handleCounterDrop}
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
        </div>
      </div>
    </div>
  {/if}

  <!-- Context Menu -->
  {#if contextMenu}
    <ZoneContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      zoneName={contextMenu.zoneName}
      cardCount={contextMenu.cardCount}
      onShuffle={handleShuffle}
      onPeekTop={(count) => handleCardModal('peek', 'top', count)}
      onPeekBottom={(count) => handleCardModal('peek', 'bottom', count)}
      onArrangeTop={(count) => handleCardModal('arrange', 'top', count)}
      onArrangeBottom={(count) => handleCardModal('arrange', 'bottom', count)}
      onClearCounters={handleClearCounters}
      onClose={closeContextMenu}
    />
  {/if}

  <!-- Card Modal (Peek/Arrange) -->
  {#if cardModal}
    <ArrangeModal
      cards={cardModal.cards}
      zoneName={cardModal.zoneName}
      position={cardModal.position}
      mode={cardModal.mode}
      {cardBack}
      onConfirm={handleCardModalConfirm}
      onClose={closeCardModal}
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
  {#if coinFlipping}
    <div class="coin-modal-overlay">
      <div class="coin-modal">
        <div class="coin-container" class:showing-result={coinResult !== null}>
          <img
            src={coinShowingFront ? coinFront : coinBackImg}
            alt="Coin"
            class="coin-image"
            class:flipping={coinResult === null}
          />
        </div>
        {#if coinResult}
          <div class="coin-result text-gbc-yellow text-lg mt-4">
            {coinResult === 'heads' ? 'HEADS!' : 'TAILS!'}
          </div>
        {/if}
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

  .game-layout {
    @apply flex justify-center items-start;
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
    @apply max-lg:w-auto;
  }

  .log-content {
    @apply overflow-y-auto px-2;
    height: 25rem;
    scrollbar-width: thin;
    scrollbar-color: var(--color-gbc-green) var(--color-gbc-border);
  }

  .log-entry {
    @apply py-0.5 border-b border-gbc-border/30;
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

  .coin-modal-overlay {
    @apply fixed inset-0 z-50 flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .coin-modal {
    @apply flex flex-col items-center justify-center p-8;
  }

  .coin-container {
    @apply relative;
    perspective: 1000px;
  }

  .coin-image {
    width: 12rem;
    height: 12rem;
    @apply rounded-full object-cover;
    box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.5);
  }

  .coin-image.flipping {
    animation: coin-flip 0.15s linear infinite;
  }

  .coin-container.showing-result .coin-image {
    animation: coin-land 0.3s ease-out forwards;
  }

  .coin-result {
    @apply font-retro tracking-wider;
    text-shadow:
      0.125rem 0.125rem 0 var(--color-gbc-red),
      0.25rem 0.25rem 0 var(--color-gbc-border);
    animation: result-pop 0.3s ease-out;
  }

  @keyframes coin-flip {
    0% { transform: rotateY(0deg) scale(1); }
    50% { transform: rotateY(90deg) scale(1.1); }
    100% { transform: rotateY(180deg) scale(1); }
  }

  @keyframes coin-land {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  @keyframes result-pop {
    0% { transform: scale(0); opacity: 0; }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); opacity: 1; }
  }
</style>
