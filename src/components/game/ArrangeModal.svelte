<script lang="ts">
  import { onMount } from 'svelte';
  import type { CardInstance, CardTemplate } from '../../core';
  import { VISIBILITY } from '../../core';
  import Card from './Card.svelte';
  import { playSfx } from '../../lib/audio.svelte';
  import { startDrag, updateDragPosition, endDrag } from './dragState.svelte';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    zoneName: string;
    allowReorder: boolean;
    isDecision?: boolean;
    zoneKey?: string;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    cardBack?: string;
    onConfirm?: (selectedCards: CardInstance<CardTemplate>[]) => void;
    onReorder?: (cards: CardInstance<CardTemplate>[]) => void;
    onResolveDecision?: () => void;
    onClose: () => void;
  }

  let {
    cards,
    zoneName,
    allowReorder,
    isDecision = false,
    zoneKey,
    renderFace,
    cardBack,
    onConfirm,
    onReorder,
    onResolveDecision,
    onClose,
  }: Props = $props();

  const isSelectable = $derived(!isDecision && !!onConfirm);

  const title = $derived.by(() => {
    const sel = selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : '';
    if (isDecision) return `Revealed: ${zoneName}`;
    if (allowReorder) return `Browse ${zoneName}${sel}`;
    return `Peek ${zoneName}${sel}`;
  });

  // Selection state
  let selectedIds = $state<Set<string>>(new Set());

  // Mousedown-based reorder state
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let orderChanged = $state(false);
  let mouseDownPos = $state<{ x: number; y: number } | null>(null);
  let isDragging = $state(false);
  const DRAG_THRESHOLD = 8;

  // Wrapper that applies reorder before closing
  function doClose() {
    if (orderChanged && onReorder) {
      onReorder([...orderedCards]);
    }
    onClose();
  }

  function toggleSelection(instanceId: string) {
    if (!isSelectable) return;
    const next = new Set(selectedIds);
    if (next.has(instanceId)) {
      next.delete(instanceId);
    } else {
      next.add(instanceId);
    }
    selectedIds = next;
    playSfx('cursor');
  }

  function handleConfirm() {
    const selected = orderedCards.filter(c => selectedIds.has(c.instanceId));
    // Map back to original cards (preserving original visibility)
    const originals = selected.map(visibleCard => {
      const original = originalCards.find(c => c.instanceId === visibleCard.instanceId);
      return original ?? visibleCard;
    });
    onConfirm?.(originals);
  }

  // Create visible copies of cards for display (force face-up)
  function makeVisible(card: CardInstance<CardTemplate>): CardInstance<CardTemplate> {
    return {
      ...card,
      visibility: VISIBILITY.PUBLIC,
    };
  }

  // Local state for card display
  let orderedCards = $state<CardInstance<CardTemplate>[]>([]);

  // Initialize ordered cards from props (runs once on mount), force visible
  // Show top-of-zone first (reverse array order)
  $effect(() => {
    if (orderedCards.length === 0 && cards.length > 0) {
      orderedCards = [...cards].reverse().map(makeVisible);
    } else if (orderedCards.length > 0) {
      // Sync removals from parent (e.g. card removed externally)
      const cardIds = new Set(cards.map(c => c.instanceId));
      const filtered = orderedCards.filter(c => cardIds.has(c.instanceId));
      if (filtered.length !== orderedCards.length) {
        orderedCards = filtered;
      }
    }
  });

  // Auto-close when all cards removed
  $effect(() => {
    if (cards.length === 0 && orderedCards.length === 0) {
      doClose();
    }
  });

  // Keep reference to original cards for confirm (to preserve original visibility)
  const originalCards = $derived(cards);

  // Find which card-slot index is under a given mouse position
  function getSlotIndexAtPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const slot = el?.closest('[data-slot-index]') as HTMLElement | null;
    if (slot) {
      return parseInt(slot.dataset.slotIndex!, 10);
    }
    return null;
  }

  // Mousedown on a card slot — start potential drag (reorder) or click (select)
  function handleSlotMouseDown(event: MouseEvent, index: number) {
    if (!allowReorder) return;
    // Only left mouse button
    if (event.button !== 0) return;
    mouseDownPos = { x: event.clientX, y: event.clientY };
    dragIndex = index;

    function onMouseMove(e: MouseEvent) {
      if (!mouseDownPos) return;
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (!isDragging && (dx * dx + dy * dy) > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        isDragging = true;
        // Show DragOverlay via the global drag store
        const card = orderedCards[index];
        if (card) {
          startDrag(card, 'modal', e.clientX, e.clientY);
        }
      }
      if (isDragging) {
        updateDragPosition(e.clientX, e.clientY);
        const targetIndex = getSlotIndexAtPoint(e.clientX, e.clientY);
        dragOverIndex = targetIndex !== dragIndex ? targetIndex : null;
      }
    }

    function onMouseUp(e: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (isDragging) {
        // Clear the DragOverlay
        endDrag();

        if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
          // Perform reorder
          const newOrder = [...orderedCards];
          const [removed] = newOrder.splice(dragIndex, 1);
          newOrder.splice(dragOverIndex, 0, removed);
          orderedCards = newOrder;
          orderChanged = true;
          playSfx('cursor');
        }
      } else {
        // Was a click, not a drag — handle selection
        const card = orderedCards[index];
        if (card && isSelectable) {
          toggleSelection(card.instanceId);
        }
      }

      dragIndex = null;
      dragOverIndex = null;
      mouseDownPos = null;
      isDragging = false;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // For non-reorder modes, simple click handler
  function handleSlotClick(card: CardInstance<CardTemplate>) {
    if (allowReorder) return; // handled by mousedown/mouseup above
    if (isSelectable) {
      toggleSelection(card.instanceId);
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      playSfx('cancel');
      doClose();
    }
  }

  // Global Escape key handler
  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        playSfx('cancel');
        doClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={(e) => { if (e.key === 'Escape') { playSfx('cancel'); doClose(); } }} role="presentation">
  <div class="modal gbc-panel">
    <div class="modal-header">
      <span class="modal-title">{title}</span>
      <button class="close-btn" onclick={() => { playSfx('cancel'); doClose(); }}>×</button>
    </div>

    <div class="modal-content browse-content">
      <div class="card-row card-row-wrap">
        {#each orderedCards as card, i (card.instanceId)}
          <div
            class="card-slot"
            class:selectable={isSelectable}
            class:selected={isSelectable && selectedIds.has(card.instanceId)}
            class:reorderable={allowReorder}
            class:dragging={isDragging && dragIndex === i}
            class:drag-over={isDragging && dragOverIndex === i}
            data-slot-index={i}
            ondragstart={(e: DragEvent) => e.preventDefault()}
            onmousedown={allowReorder ? (e: MouseEvent) => handleSlotMouseDown(e, i) : undefined}
            onclick={!allowReorder ? () => handleSlotClick(card) : undefined}
            onkeydown={(e: KeyboardEvent) => { if (!allowReorder && (e.key === 'Enter' || e.key === ' ')) handleSlotClick(card); }}
            role="button"
            tabindex="0"
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
      {#if isDecision}
        <button class="gbc-btn secondary" onclick={() => { playSfx('cancel'); doClose(); }}>Dismiss</button>
        <button class="gbc-btn" onclick={() => { playSfx('confirm'); onResolveDecision?.(); }}>ACKNOWLEDGE</button>
      {:else if isSelectable && selectedIds.size > 0}
        <button class="gbc-btn secondary" onclick={() => { playSfx('cancel'); doClose(); }}>Cancel</button>
        <button class="gbc-btn" onclick={handleConfirm}>Confirm ({selectedIds.size})</button>
      {:else}
        <button class="gbc-btn" onclick={() => { playSfx('cancel'); doClose(); }}>Close</button>
      {/if}
      {#if allowReorder && !isDecision}
        <span class="text-gbc-light text-[0.4rem] ml-2">Drag to reorder</span>
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
    @apply p-4 overflow-x-auto;
  }

  .card-row {
    @apply flex gap-4 justify-center items-start;
  }

  .card-row-wrap {
    @apply flex-wrap gap-3;
  }

  .browse-content {
    @apply overflow-y-auto overflow-x-hidden;
  }

  .card-slot {
    @apply flex flex-col items-center gap-2 relative;
    transition: transform 0.15s, opacity 0.15s;
  }

  .card-slot.reorderable {
    @apply cursor-grab;
  }

  .card-slot.selectable {
    @apply cursor-pointer;
    --zone-scale: 1.5;
    margin: 0.5rem;
  }

  .card-slot:hover {
    transform: translateY(-0.25rem);
  }

  .card-slot.selected,
  .card-slot.selected:hover {
    transform: translateY(-0.5rem);
  }

  .card-slot.selected::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    aspect-ratio: 5 / 7;
    border: 3px solid red;
    border-radius: 0.5rem;
    pointer-events: none;
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
