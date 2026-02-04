<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playmat, CardInstance, Visibility } from '../../core';
  import { executeAction, moveCard, flipCard, VISIBILITY } from '../../core';
  import {
    startSolitaire,
    getSolitairePlaymat,
    type SolitaireGameState,
    type PlayingCardTemplate,
  } from '../../plugins/solitaire';
  import { getSuitSymbol } from '../../plugins/solitaire/deck';
  import PlaymatGrid from './PlaymatGrid.svelte';

  // Game state
  let gameState = $state<SolitaireGameState | null>(null);
  let playmat = $state<Playmat | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Drag state - includes original visibility to preserve it
  let dragState = $state<{
    cardInstanceId: string;
    fromZoneId: string;
    originalVisibility: Visibility;
  } | null>(null);

  // Preview state
  let previewCard = $state<CardInstance<PlayingCardTemplate> | null>(null);

  onMount(async () => {
    try {
      playmat = await getSolitairePlaymat();
      gameState = await startSolitaire();
      loading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load game';
      loading = false;
    }
  });

  function handleDragStart(cardInstanceId: string, fromZoneId: string) {
    if (!gameState) return;

    // Find card and save its visibility
    for (const zone of Object.values(gameState.zones)) {
      const card = zone.cards.find((c) => c.instanceId === cardInstanceId);
      if (card) {
        dragState = {
          cardInstanceId,
          fromZoneId,
          originalVisibility: [...card.visibility] as Visibility
        };
        break;
      }
    }
  }

  function handleDragEnd() {
    dragState = null;
  }

  function handleDrop(cardInstanceId: string, toZoneId: string) {
    if (!gameState || !dragState) return;

    // Don't move to same zone
    if (dragState.fromZoneId === toZoneId) {
      dragState = null;
      return;
    }

    const savedVisibility = dragState.originalVisibility;

    // Execute move action
    const action = moveCard(0, cardInstanceId, dragState.fromZoneId, toZoneId);
    executeAction(gameState, action);

    // Restore original visibility (moveCard changes it to zone default)
    const flipAction = flipCard(0, cardInstanceId, savedVisibility);
    executeAction(gameState, flipAction);

    // Force reactivity
    gameState = { ...gameState };
    dragState = null;
  }

  function handlePreview(card: CardInstance<PlayingCardTemplate>) {
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
        const action = flipCard(0, cardInstanceId, newVisibility);
        executeAction(gameState, action);
        gameState = { ...gameState };
        break;
      }
    }
  }

  function resetGame() {
    startSolitaire().then((state) => {
      gameState = state;
      previewCard = null;
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
          onDrop={handleDrop}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onPreview={handlePreview}
          onToggleVisibility={handleToggleVisibility}
        />
      </div>

      <div class="sidebar">
        <div class="gbc-panel preview-panel">
          <div class="text-gbc-yellow text-[0.5rem] text-center mb-3 py-1 px-2 bg-gbc-border">PREVIEW</div>
          {#if previewCard && previewCard.visibility[0]}
            <div class="preview-card" class:red={previewCard.template.color === 'red'} class:black={previewCard.template.color === 'black'}>
              <div class="preview-rank">{previewCard.template.rank}</div>
              <div class="preview-suit">{getSuitSymbol(previewCard.template.suit)}</div>
              <div class="preview-name">{previewCard.template.rank} of {previewCard.template.suit}</div>
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
    @apply bg-gbc-cream;
  }

  .preview-card.red {
    color: var(--color-gbc-red);
  }

  .preview-card.black {
    color: var(--color-gbc-border);
  }

  .preview-card.face-down {
    @apply bg-gbc-blue;
  }

  .preview-rank {
    font-size: 4rem;
    font-weight: bold;
  }

  .preview-suit {
    font-size: 6rem;
  }

  .preview-name {
    @apply text-[0.6rem] mt-4 text-gbc-border;
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
