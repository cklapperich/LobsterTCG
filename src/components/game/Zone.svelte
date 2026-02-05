<script lang="ts">
  import { onMount } from 'svelte';
  import type { Zone as ZoneType, PlaymatSlot, CardInstance, CardTemplate } from '../../core';
  import CardStack from './CardStack.svelte';

  interface Props {
    zone: ZoneType<CardTemplate>;
    slot: PlaymatSlot;
    cardBack?: string;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    isShuffling?: boolean;
    shufflePacketStart?: number;
    onDrop?: (cardInstanceId: string, toZoneId: string, position?: number) => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onZoneContextMenu?: (zoneId: string, zoneName: string, cardCount: number, x: number, y: number) => void;
  }

  let {
    zone,
    slot,
    cardBack,
    renderFace,
    isShuffling = false,
    shufflePacketStart = -1,
    onDrop,
    onPreview,
    onToggleVisibility,
    onZoneContextMenu,
  }: Props = $props();

  let isDragOver = $state(false);

  const stackDirection = $derived(slot.stackDirection ?? 'none');
  const label = $derived(slot.label ?? zone.config.name);
  const fixedSize = $derived(slot.fixedSize ?? false);

  let zoneEl: HTMLDivElement;

  onMount(() => {
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onZoneContextMenu?.(zone.key, label, zone.cards.length, e.clientX, e.clientY);
      return false;
    }
    zoneEl.addEventListener('contextmenu', handleContextMenu, { capture: true });
    return () => zoneEl.removeEventListener('contextmenu', handleContextMenu, { capture: true });
  });

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  // Zone background drop = bottom of stack (position 0 = lowest z-index = visually behind)
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    const cardInstanceId = event.dataTransfer?.getData('text/plain');
    if (cardInstanceId) {
      // Zone background drop always goes to bottom (insert at index 0)
      onDrop?.(cardInstanceId, zone.key, 0);
    }
  }

  // Card-to-card drop: insert after target card (higher z-index = visually on top)
  function handleCardDrop(droppedCardId: string, _targetCardId: string, targetIndex: number) {
    onDrop?.(droppedCardId, zone.key, targetIndex + 1);
  }

</script>

<div
  class="zone"
  class:drag-over={isDragOver}
  role="region"
  aria-label={label}
  bind:this={zoneEl}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="zone-label">{label}</div>
  <div class="zone-content" class:fixed-size={fixedSize}>
    {#if zone.cards.length > 0}
      <CardStack
        cards={zone.cards}
        {stackDirection}
        {fixedSize}
        zoneKey={zone.key}
        {cardBack}
        {renderFace}
        {isShuffling}
        {shufflePacketStart}
        {onPreview}
        {onToggleVisibility}
        onCardDrop={handleCardDrop}
      />
    {:else}
      <div class="empty-zone"></div>
    {/if}
  </div>
</div>

<style>
  @reference "../../app.css";

  .zone {
    @apply bg-gbc-dark-green border-4 border-gbc-border p-2 rounded;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(255,255,255,0.1),
      inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2);
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .zone.drag-over {
    @apply border-gbc-yellow;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(255,255,255,0.1),
      inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2),
      0 0 0.5rem var(--color-gbc-yellow);
  }

  .zone-label {
    @apply text-gbc-yellow text-[0.4rem] text-center mb-2 py-0.5 px-1 bg-gbc-border inline-block;
    @apply relative left-1/2 -translate-x-1/2;
    cursor: context-menu;
  }

  .zone-content {
    @apply relative;
    min-height: calc(var(--spacing-card-w) * 1.4);
  }

  .zone-content.fixed-size {
    max-height: calc(var(--spacing-card-w) * 1.4);
    overflow: hidden;
  }

  .empty-zone {
    @apply w-card-w aspect-[5/7] rounded-lg border-2 border-dashed border-gbc-light opacity-30;
    @apply max-sm:w-card-w-sm;
  }
</style>
