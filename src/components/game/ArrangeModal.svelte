<script lang="ts">
  import { onMount } from 'svelte';
  import type { CardInstance, CardTemplate } from '../../core';
  import { VISIBILITY } from '../../core';
  import Card from './Card.svelte';
  import { playSfx } from '../../lib/audio.svelte';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    zoneName: string;
    position: 'top' | 'bottom' | 'all';
    mode: 'peek' | 'arrange' | 'browse';
    zoneKey?: string;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    cardBack?: string;
    onConfirm?: (reorderedCards: CardInstance<CardTemplate>[]) => void;
    onDragOut?: (card: CardInstance<CardTemplate>, zoneKey: string, mouseX: number, mouseY: number) => void;
    onResolveDecision?: () => void;
    onClose: () => void;
  }

  let {
    cards,
    zoneName,
    position,
    mode,
    zoneKey,
    renderFace,
    cardBack,
    onConfirm,
    onDragOut,
    onResolveDecision,
    onClose,
  }: Props = $props();

  const canReorder = $derived(mode === 'arrange');
  const isBrowse = $derived(mode === 'browse');
  const title = $derived.by(() => {
    if (mode === 'browse') return `Browse ${zoneName}`;
    if (position === 'all') {
      return mode === 'peek' ? `Viewing ${zoneName}` : `Arrange ${zoneName}`;
    }
    return mode === 'peek' ? `Peeking at ${position} of ${zoneName}` : `Arrange ${position} of ${zoneName}`;
  });

  // Create visible copies of cards for display (force face-up)
  function makeVisible(card: CardInstance<CardTemplate>): CardInstance<CardTemplate> {
    return {
      ...card,
      visibility: VISIBILITY.PUBLIC,
    };
  }

  // Local state for reordering - use derived initial value
  let orderedCards = $state<CardInstance<CardTemplate>[]>([]);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // Initialize ordered cards from props (runs once on mount), force visible
  $effect(() => {
    if (orderedCards.length === 0 && cards.length > 0) {
      orderedCards = cards.map(makeVisible);
    }
  });

  // Keep reference to original cards for confirm (to preserve original visibility)
  const originalCards = $derived(cards);

  function handleDragStart(index: number) {
    if (!canReorder) return;
    dragIndex = index;
  }

  function handleDragOver(event: DragEvent, index: number) {
    if (!canReorder) return;
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(targetIndex: number) {
    if (!canReorder) return;
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

  function handleBrowseDragStart(event: MouseEvent, card: CardInstance<CardTemplate>) {
    if (!isBrowse || !zoneKey) return;
    event.preventDefault();
    onDragOut?.(card, zoneKey, event.clientX, event.clientY);
  }

  function handleConfirm() {
    // Map back to original cards with their original visibility
    const reordered = orderedCards.map(visibleCard => {
      const original = originalCards.find(c => c.instanceId === visibleCard.instanceId);
      return original ?? visibleCard;
    });
    onConfirm?.(reordered);
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      playSfx('cancel');
      onClose();
    }
  }

  // Global Escape key handler
  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        playSfx('cancel');
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={(e) => { if (e.key === 'Escape') { playSfx('cancel'); onClose(); } }} role="presentation">
  <div class="modal gbc-panel">
    <div class="modal-header">
      <span class="modal-title">{title}</span>
      <button class="close-btn" onclick={() => { playSfx('cancel'); onClose(); }}>×</button>
    </div>

    <div class="modal-content">
      <div class="card-row">
        {#each orderedCards as card, i (card.instanceId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="card-slot"
            class:dragging={dragIndex === i}
            class:drag-over={dragOverIndex === i}
            class:readonly={!canReorder && !isBrowse}
            class:browse={isBrowse}
            draggable={canReorder}
            ondragstart={() => handleDragStart(i)}
            ondragover={(e) => handleDragOver(e, i)}
            ondragleave={handleDragLeave}
            ondrop={() => handleDrop(i)}
            ondragend={handleDragEnd}
            onmousedown={isBrowse ? (e: MouseEvent) => handleBrowseDragStart(e, card) : undefined}
          >
            <Card
              {card}
              index={0}
              zoneKey="modal"
              draggable={false}
              {renderFace}
              {cardBack}
            />
            <span class="card-index">{i + 1}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="modal-footer">
      {#if canReorder}
        <button class="gbc-btn secondary" onclick={() => { playSfx('cancel'); onClose(); }}>Cancel</button>
        <button class="gbc-btn" onclick={handleConfirm}>Confirm</button>
      {:else if onResolveDecision}
        <button class="gbc-btn secondary" onclick={() => { playSfx('cancel'); onClose(); }}>Dismiss</button>
        <button class="gbc-btn" onclick={() => { playSfx('confirm'); onResolveDecision(); }}>ACKNOWLEDGE</button>
      {:else}
        <button class="gbc-btn" onclick={() => { playSfx('cancel'); onClose(); }}>Close</button>
      {/if}
      {#if isBrowse && !onResolveDecision}
        <span class="text-gbc-light text-[0.4rem] ml-2">Click a card to drag it out</span>
      {/if}
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

  .card-slot.readonly {
    @apply cursor-default;
  }

  .card-slot.browse {
    @apply cursor-grab;
  }

  .card-slot:hover {
    transform: translateY(-0.25rem);
  }

  .card-slot.readonly:hover {
    transform: none;
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
