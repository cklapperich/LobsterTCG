<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playmat, CardInstance, CardTemplate, GameState } from '../../core';
  import { executeAction, shuffle, VISIBILITY, flipCard, parseZoneKey } from '../../core';
  import { plugin } from '../../plugins/pokemon';
  import PlaymatGrid from './PlaymatGrid.svelte';
  import ZoneContextMenu from './ZoneContextMenu.svelte';
  import PeekModal from './PeekModal.svelte';
  import ArrangeModal from './ArrangeModal.svelte';
  import DragOverlay from './DragOverlay.svelte';
  import { dragStore, executeDrop } from './dragState.svelte';

  // Game state
  let gameState = $state<GameState<CardTemplate> | null>(null);
  let playmat = $state<Playmat | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Reactive drag state from external module
  const dragState = $derived(dragStore.current);

  // Preview state
  let previewCard = $state<CardInstance<CardTemplate> | null>(null);

  // Context menu state
  let contextMenu = $state<{
    zoneKey: string;
    zoneName: string;
    cardCount: number;
    x: number;
    y: number;
  } | null>(null);

  // Modal states
  let peekModal = $state<{
    cards: CardInstance<CardTemplate>[];
    zoneName: string;
    position: 'top' | 'bottom';
  } | null>(null);

  let arrangeModal = $state<{
    cards: CardInstance<CardTemplate>[];
    zoneKey: string;
    zoneName: string;
    position: 'top' | 'bottom';
  } | null>(null);

  // Card back from plugin
  const cardBack = plugin.getCardBack?.() ?? '/card-images/pokemon/cardback.png';

  onMount(async () => {
    try {
      playmat = await plugin.getPlaymat();
      gameState = await plugin.startGame();
      loading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load game';
      loading = false;
    }
  });

  function handleDrop(cardInstanceId: string, toZoneKey: string, position?: number) {
    if (!gameState) return;
    const updatedState = executeDrop(cardInstanceId, toZoneKey, gameState, position);
    if (updatedState) {
      gameState = updatedState;
    }
  }

  function handlePreview(card: CardInstance<CardTemplate>) {
    previewCard = card as CardInstance<PlayingCardTemplate>;
  }

  function handleToggleVisibility(cardInstanceId: string) {
    if (!gameState) return;

    for (const zone of Object.values(gameState.zones)) {
      const card = zone.cards.find((c) => c.instanceId === cardInstanceId);
      if (card) {
        const newVisibility = card.visibility[0]
          ? VISIBILITY.HIDDEN
          : VISIBILITY.PUBLIC;
        const action = flipCard(0, cardInstanceId, newVisibility);
        executeAction(gameState, action);
        gameState = { ...gameState };
        break;
      }
    }
  }

  // Context menu handlers
  function handleZoneContextMenu(zoneKey: string, zoneName: string, cardCount: number, x: number, y: number) {
    contextMenu = { zoneKey, zoneName, cardCount, x, y };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleShuffle() {
    if (!gameState || !contextMenu) return;
    const { playerIndex, zoneId } = parseZoneKey(contextMenu.zoneKey);
    const action = shuffle(playerIndex, zoneId);
    executeAction(gameState, action);
    gameState = { ...gameState };
  }

  function getZoneCards(zoneKey: string): CardInstance<CardTemplate>[] {
    if (!gameState) return [];
    return gameState.zones[zoneKey]?.cards ?? [];
  }

  function handlePeekTop(count: number) {
    if (!contextMenu) return;
    const zoneCards = getZoneCards(contextMenu.zoneKey);
    // Last cards in array = highest z-index = visually on TOP
    const cards = zoneCards.slice(-count);
    peekModal = {
      cards,
      zoneName: contextMenu.zoneName,
      position: 'top',
    };
  }

  function handlePeekBottom(count: number) {
    if (!contextMenu) return;
    // First cards in array = lowest z-index = visually at BOTTOM
    const cards = getZoneCards(contextMenu.zoneKey).slice(0, count);
    peekModal = {
      cards,
      zoneName: contextMenu.zoneName,
      position: 'bottom',
    };
  }

  function closePeekModal() {
    peekModal = null;
  }

  function handleArrangeTop(count: number) {
    if (!contextMenu) return;
    const zoneCards = getZoneCards(contextMenu.zoneKey);
    // Last cards in array = highest z-index = visually on TOP
    const cards = zoneCards.slice(-count);
    arrangeModal = {
      cards,
      zoneKey: contextMenu.zoneKey,
      zoneName: contextMenu.zoneName,
      position: 'top',
    };
  }

  function handleArrangeBottom(count: number) {
    if (!contextMenu) return;
    // First cards in array = lowest z-index = visually at BOTTOM
    const cards = getZoneCards(contextMenu.zoneKey).slice(0, count);
    arrangeModal = {
      cards,
      zoneKey: contextMenu.zoneKey,
      zoneName: contextMenu.zoneName,
      position: 'bottom',
    };
  }

  function handleArrangeConfirm(reorderedCards: CardInstance<CardTemplate>[]) {
    if (!gameState || !arrangeModal) return;

    const zone = gameState.zones[arrangeModal.zoneKey];
    if (!zone) return;

    const count = reorderedCards.length;

    if (arrangeModal.position === 'top') {
      // Replace top N cards (last in array = highest z-index = visually on top)
      zone.cards.splice(-count, count, ...reorderedCards as CardInstance<PlayingCardTemplate>[]);
    } else {
      // Replace bottom N cards (first in array = lowest z-index = visually at bottom)
      zone.cards.splice(0, count, ...reorderedCards as CardInstance<PlayingCardTemplate>[]);
    }

    gameState = { ...gameState };
    arrangeModal = null;
  }

  function closeArrangeModal() {
    arrangeModal = null;
  }

  function resetGame() {
    plugin.startGame().then((state) => {
      gameState = state;
      previewCard = null;
      contextMenu = null;
      peekModal = null;
      arrangeModal = null;
    });
  }
</script>

<div class="game-container font-retro bg-gbc-bg min-h-screen w-screen p-4 box-border relative overflow-auto">
  <div class="scanlines"></div>

  <header class="gbc-panel text-center mb-4">
    <h1 class="text-gbc-yellow text-xl max-sm:text-sm m-0 tracking-wide title-shadow">
      {playmat?.name ?? 'LOADING...'}
    </h1>
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
          onDrop={handleDrop}
          onPreview={handlePreview}
          onToggleVisibility={handleToggleVisibility}
          onZoneContextMenu={handleZoneContextMenu}
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

        <div class="gbc-panel controls-panel">
          <button class="gbc-btn text-[0.5rem] py-2 px-4 w-full" onclick={resetGame}>
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Context Menu -->
  {#if contextMenu}
    <ZoneContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      zoneKey={contextMenu.zoneKey}
      zoneName={contextMenu.zoneName}
      cardCount={contextMenu.cardCount}
      onShuffle={handleShuffle}
      onPeekTop={handlePeekTop}
      onPeekBottom={handlePeekBottom}
      onArrangeTop={handleArrangeTop}
      onArrangeBottom={handleArrangeBottom}
      onClose={closeContextMenu}
    />
  {/if}

  <!-- Peek Modal -->
  {#if peekModal}
    <PeekModal
      cards={peekModal.cards}
      zoneName={peekModal.zoneName}
      position={peekModal.position}
      renderCardInfo={plugin.getCardInfo}
      onClose={closePeekModal}
    />
  {/if}

  <!-- Arrange Modal -->
  {#if arrangeModal}
    <ArrangeModal
      cards={arrangeModal.cards}
      zoneName={arrangeModal.zoneName}
      position={arrangeModal.position}
      {cardBack}
      onConfirm={handleArrangeConfirm}
      onCancel={closeArrangeModal}
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

  .controls-panel {
    @apply max-lg:w-auto;
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
</style>
