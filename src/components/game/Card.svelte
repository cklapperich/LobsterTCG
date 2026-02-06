<script lang="ts">
  import type { CardInstance, CardTemplate, CounterDefinition } from '../../core';
  import { ORIENTATIONS } from '../../core';
  import { startDrag, updateDragPosition, endDrag } from './dragState.svelte';
  import {
    startCounterDrag,
    updateCounterDragPosition,
    endCounterDrag,
    counterDragStore,
  } from './counterDragState.svelte';
  import CounterIcon from './CounterIcon.svelte';
  import { playSfx } from '../../lib/audio.svelte';

  interface Props {
    card: CardInstance<CardTemplate>;
    index: number;
    draggable?: boolean;
    zoneKey: string;
    isDropTarget?: boolean;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
    // For playing cards without images - render functions
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onCardDrop?: (droppedCardId: string, targetCardId: string, targetIndex: number) => void;
    onCounterDrop?: (counterId: string, cardInstanceId: string) => void;
  }

  let {
    card,
    index,
    draggable = true,
    zoneKey,
    isDropTarget = false,
    cardBack,
    counterDefinitions = [],
    renderFace,
    onPreview,
    onToggleVisibility,
    onCardDrop,
    onCounterDrop,
  }: Props = $props();

  let isDragging = $state(false);
  let isDragOver = $state(false);
  let isCounterDragOver = $state(false);

  const isFaceUp = $derived(card.visibility[0]);
  const template = $derived(card.template);

  // Get render data if renderFace provided, otherwise use template.imageUrl
  const faceData = $derived(renderFace ? renderFace(template) : null);
  const hasImage = $derived(!!template.imageUrl);

  // Get counters on this card with their definitions
  const cardCounters = $derived(() => {
    const result: { definition: CounterDefinition; quantity: number }[] = [];
    for (const [counterId, quantity] of Object.entries(card.counters)) {
      if (quantity > 0) {
        const definition = counterDefinitions.find((c) => c.id === counterId);
        if (definition) {
          result.push({ definition, quantity });
        }
      }
    }
    // Sort by category then sortOrder
    return result.sort((a, b) => {
      const catA = a.definition.category ?? '';
      const catB = b.definition.category ?? '';
      if (catA !== catB) return catA.localeCompare(catB);
      return (a.definition.sortOrder ?? 0) - (b.definition.sortOrder ?? 0);
    });
  });

  // Create a transparent 1x1 pixel image for suppressing native drag preview
  const transparentImg = new Image();
  transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function handleDragStart(event: DragEvent) {
    if (!draggable) return;
    isDragging = true;
    event.dataTransfer?.setData('text/plain', card.instanceId);
    // Suppress browser's default ghost image with transparent pixel
    event.dataTransfer?.setDragImage(transparentImg, 0, 0);
    startDrag(card, zoneKey, event.clientX, event.clientY);
  }

  function handleDrag(event: DragEvent) {
    // During drag, clientX/Y can be 0 when cursor leaves window - ignore those
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateDragPosition(event.clientX, event.clientY);
    }
  }

  function handleDragEnd() {
    isDragging = false;
    endDrag();
  }

  function handleClick() {
    playSfx('cursor');
    onPreview?.(card);
  }

  function handleDoubleClick() {
    onToggleVisibility?.(card.instanceId);
  }

  function handleDragOver(event: DragEvent) {
    if (!isDropTarget) return;
    event.preventDefault();
    event.stopPropagation();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    if (!isDropTarget) return;
    event.preventDefault();
    event.stopPropagation();
    isDragOver = false;
    const droppedCardId = event.dataTransfer?.getData('text/plain');
    if (droppedCardId && droppedCardId !== card.instanceId) {
      onCardDrop?.(droppedCardId, card.instanceId, index);
    }
  }

  // Counter drag handling on card
  function handleCounterDragOver(event: DragEvent) {
    const data = event.dataTransfer?.getData('text/plain');
    // Check if it's a counter being dragged
    if (counterDragStore.current) {
      event.preventDefault();
      event.stopPropagation();
      isCounterDragOver = true;
    }
  }

  function handleCounterDragLeave() {
    isCounterDragOver = false;
  }

  function handleCounterDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isCounterDragOver = false;
    if (counterDragStore.current) {
      onCounterDrop?.(counterDragStore.current.counterId, card.instanceId);
    }
  }

  // Dragging a counter FROM this card
  const counterTransparentImg = new Image();
  counterTransparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function handleCounterDragStart(event: DragEvent, counterId: string) {
    event.stopPropagation();
    event.dataTransfer?.setData('text/plain', `counter:${counterId}`);
    event.dataTransfer?.setDragImage(counterTransparentImg, 0, 0);
    startCounterDrag(counterId, card.instanceId, event.clientX, event.clientY);
  }

  function handleCounterDrag(event: DragEvent) {
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateCounterDragPosition(event.clientX, event.clientY);
    }
  }

  function handleCounterDragEnd() {
    endCounterDrag();
  }
</script>

<button
  type="button"
  class="card"
  class:face-up={isFaceUp}
  class:face-down={!isFaceUp}
  class:red={isFaceUp && faceData?.color === 'red'}
  class:black={isFaceUp && faceData?.color === 'black'}
  class:dragging={isDragging}
  class:drop-target={isDragOver}
  class:counter-drop-target={isCounterDragOver}
  data-orientation={card.orientation ?? ORIENTATIONS.NORMAL}
  style="--i: {index}"
  {draggable}
  ondragstart={handleDragStart}
  ondrag={handleDrag}
  ondragend={handleDragEnd}
  ondragover={(e) => { handleDragOver(e); handleCounterDragOver(e); }}
  ondragleave={() => { handleDragLeave(); handleCounterDragLeave(); }}
  ondrop={(e) => { handleDrop(e); handleCounterDrop(e); }}
  onclick={handleClick}
  ondblclick={handleDoubleClick}
>
  {#if isFaceUp}
    {#if hasImage}
      <!-- Image-based card face -->
      <div class="card-face card-image">
        <img src={template.imageUrl} alt={template.name} />
      </div>
    {:else if faceData}
      <!-- Text-based card face (playing cards) -->
      <div class="card-face">
        <div class="corner top-left">
          <span class="rank">{faceData.rank}</span>
          <span class="suit">{faceData.suit}</span>
        </div>
        <div class="center-suit">{faceData.suit}</div>
        <div class="corner bottom-right">
          <span class="rank">{faceData.rank}</span>
          <span class="suit">{faceData.suit}</span>
        </div>
      </div>
    {:else}
      <!-- Fallback: just show name -->
      <div class="card-face card-name">
        <span>{template.name}</span>
      </div>
    {/if}
  {:else}
    <div class="card-back">
      {#if cardBack}
        <img src={cardBack} alt="Card back" class="back-image" />
      {:else}
        <div class="back-pattern"></div>
      {/if}
    </div>
  {/if}

  <!-- Counter overlay -->
  {#if cardCounters().length > 0}
    <div class="counter-overlay">
      {#each cardCounters() as { definition, quantity } (definition.id)}
        <div
          class="counter-item"
          draggable="true"
          ondragstart={(e) => handleCounterDragStart(e, definition.id)}
          ondrag={handleCounterDrag}
          ondragend={handleCounterDragEnd}
          role="button"
          tabindex="0"
        >
          <CounterIcon counter={definition} {quantity} size="small" showQuantity={true} />
        </div>
      {/each}
    </div>
  {/if}
</button>

<style>
  @reference "../../app.css";

  .card {
    @apply w-card-w aspect-[5/7] rounded-lg overflow-hidden p-0 cursor-pointer;
    @apply transition-all duration-200 border-4 border-gbc-border;
    @apply max-sm:w-card-w-sm;
    box-shadow: 0.125rem 0.125rem 0 rgba(0,0,0,0.2);
    position: relative;
    user-select: none;
  }

  .card[data-orientation="90"] { transform: rotate(90deg); }
  .card[data-orientation="-90"] { transform: rotate(-90deg); }
  .card[data-orientation="180"] { transform: rotate(180deg); }

  .card:hover {
    z-index: 100;
    transform: translateY(-0.25rem);
    box-shadow:
      0 0.25rem 0 rgba(0,0,0,0.3),
      0 0 0 0.125rem var(--color-gbc-yellow);
  }

  .card[data-orientation="90"]:hover { transform: rotate(90deg) translateY(-0.25rem); }
  .card[data-orientation="-90"]:hover { transform: rotate(-90deg) translateY(-0.25rem); }
  .card[data-orientation="180"]:hover { transform: rotate(180deg) translateY(-0.25rem); }

  .card.dragging {
    opacity: 0;
  }

  .card.drop-target {
    @apply border-gbc-green;
    box-shadow:
      0 0.25rem 0 rgba(0,0,0,0.3),
      0 0 0.5rem var(--color-gbc-green);
  }

  .card.face-up {
    @apply bg-gbc-cream;
  }

  .card.red {
    color: var(--color-gbc-red);
  }

  .card.black {
    color: var(--color-gbc-border);
  }

  .card-face {
    @apply w-full h-full relative font-retro;
  }

  .card-face.card-image {
    @apply p-0;
  }

  .card-face.card-image img {
    @apply w-full h-full object-cover;
  }

  .card-face.card-name {
    @apply flex items-center justify-center text-center p-2;
    font-size: 0.5rem;
  }

  .corner {
    @apply absolute flex flex-col items-center leading-tight;
    font-size: 0.6rem;
  }

  .corner .rank {
    font-size: 0.7rem;
    font-weight: bold;
  }

  .corner .suit {
    font-size: 0.6rem;
  }

  .top-left {
    @apply top-1 left-1;
  }

  .bottom-right {
    @apply bottom-1 right-1;
    transform: rotate(180deg);
  }

  .center-suit {
    @apply absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2;
    font-size: 2rem;
  }

  .card.face-down {
    @apply bg-gbc-blue;
  }

  .card-back {
    @apply w-full h-full flex items-center justify-center;
  }

  .back-image {
    @apply w-full h-full object-cover;
  }

  .back-pattern {
    @apply w-[85%] h-[90%] rounded border-2 border-gbc-cream;
    background: repeating-linear-gradient(
      45deg,
      var(--color-gbc-dark-green),
      var(--color-gbc-dark-green) 0.25rem,
      var(--color-gbc-blue) 0.25rem,
      var(--color-gbc-blue) 0.5rem
    );
  }

  .card.counter-drop-target {
    @apply border-gbc-yellow;
    box-shadow:
      0 0.25rem 0 rgba(0,0,0,0.3),
      0 0 0.5rem var(--color-gbc-yellow);
  }

  .counter-overlay {
    @apply absolute top-0 left-0 flex flex-col gap-0.5 p-0.5;
    pointer-events: auto;
    z-index: 10;
  }

  .counter-item {
    @apply cursor-grab;
  }

  .counter-item:active {
    @apply cursor-grabbing;
  }
</style>
