<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core';
  import Card from './Card.svelte';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    zoneName: string;
    position: 'top' | 'bottom';
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    cardBack?: string;
    onConfirm: (reorderedCards: CardInstance<CardTemplate>[]) => void;
    onCancel: () => void;
  }

  let {
    cards,
    zoneName,
    position,
    renderFace,
    cardBack,
    onConfirm,
    onCancel,
  }: Props = $props();

  // Local state for reordering - use derived initial value
  let orderedCards = $state<CardInstance<CardTemplate>[]>([]);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // Initialize ordered cards from props (runs once on mount)
  $effect(() => {
    if (orderedCards.length === 0 && cards.length > 0) {
      orderedCards = [...cards];
    }
  });

  function handleDragStart(index: number) {
    dragIndex = index;
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      dragIndex = null;
      dragOverIndex = null;
      return;
    }

    const newOrder = [...orderedCards];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    orderedCards = newOrder;

    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleConfirm() {
    onConfirm(orderedCards);
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
  <div class="modal gbc-panel">
    <div class="modal-header">
      <span class="modal-title">Arrange {position} of {zoneName}</span>
      <button class="close-btn" onclick={onCancel}>×</button>
    </div>

    <div class="modal-content">
      <div class="card-row">
        {#each orderedCards as card, i (card.instanceId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="card-slot"
            class:dragging={dragIndex === i}
            class:drag-over={dragOverIndex === i}
            draggable="true"
            ondragstart={() => handleDragStart(i)}
            ondragover={(e) => handleDragOver(e, i)}
            ondragleave={handleDragLeave}
            ondrop={() => handleDrop(i)}
            ondragend={handleDragEnd}
          >
            <Card
              {card}
              index={0}
              zoneId="arrange-modal"
              draggable={false}
              {renderFace}
              {cardBack}
            />
            <span class="card-index">{position === 'top' ? i + 1 : orderedCards.length - i}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="modal-footer">
      <button class="gbc-btn secondary" onclick={onCancel}>Cancel</button>
      <button class="gbc-btn" onclick={handleConfirm}>Confirm</button>
    </div>
  </div>
</div>

<style>
  @reference "../../app.css";

  .modal-backdrop {
    @apply fixed inset-0 z-50 flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .modal {
    @apply max-w-[90vw] max-h-[80vh] flex flex-col;
  }

  .modal-header {
    @apply flex justify-between items-center py-2 px-3 bg-gbc-border;
  }

  .modal-title {
    @apply text-gbc-yellow text-[0.5rem];
  }

  .close-btn {
    @apply text-gbc-cream text-lg leading-none bg-transparent border-none cursor-pointer;
    @apply hover:text-gbc-yellow;
  }

  .modal-content {
    @apply p-4 overflow-x-auto flex-1;
  }

  .card-row {
    @apply flex gap-4 justify-center items-start;
  }

  .card-slot {
    @apply flex flex-col items-center gap-2 cursor-grab relative;
    transition: transform 0.15s, opacity 0.15s;
  }

  .card-slot:hover {
    transform: translateY(-0.25rem);
  }

  .card-slot.dragging {
    @apply opacity-50;
    transform: scale(0.95);
  }

  .card-slot.drag-over {
    transform: translateY(0.25rem) scale(1.05);
  }

  .card-slot.drag-over::before {
    content: '';
    @apply absolute inset-0 rounded-lg;
    box-shadow: 0 0 0.5rem var(--color-gbc-green);
  }

  .card-index {
    @apply text-gbc-yellow text-[0.5rem] font-bold;
  }

  .modal-footer {
    @apply p-3 flex justify-end gap-2 border-t-2 border-gbc-border;
  }

  .gbc-btn {
    @apply text-[0.5rem] py-1.5 px-4;
  }

  .gbc-btn.secondary {
    @apply bg-gbc-border;
  }
</style>
