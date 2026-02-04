<script lang="ts">
  import type { Zone as ZoneType, PlaymatSlot, CardInstance } from '../../core';
  import type { PlayingCardTemplate } from '../../plugins/solitaire';
  import CardStack from './CardStack.svelte';

  interface Props {
    zone: ZoneType<PlayingCardTemplate>;
    slot: PlaymatSlot;
    onDrop?: (cardInstanceId: string, toZoneId: string) => void;
    onDragStart?: (cardInstanceId: string, zoneId: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<PlayingCardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
  }

  let {
    zone,
    slot,
    onDrop,
    onDragStart,
    onDragEnd,
    onPreview,
    onToggleVisibility,
  }: Props = $props();

  let isDragOver = $state(false);

  const stackDirection = $derived(slot.stackDirection ?? 'none');
  const label = $derived(slot.label ?? zone.config.name);

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    const cardInstanceId = event.dataTransfer?.getData('text/plain');
    if (cardInstanceId) {
      onDrop?.(cardInstanceId, slot.zoneId);
    }
  }
</script>

<div
  class="zone"
  class:drag-over={isDragOver}
  role="region"
  aria-label={label}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="zone-label">{label}</div>
  <div class="zone-content">
    {#if zone.cards.length > 0}
      <CardStack
        cards={zone.cards}
        {stackDirection}
        zoneId={slot.zoneId}
        {onDragStart}
        {onDragEnd}
        {onPreview}
        {onToggleVisibility}
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
  }

  .zone-content {
    @apply relative;
    min-height: calc(var(--spacing-card-w) * 1.4);
  }

  .empty-zone {
    @apply w-card-w aspect-[5/7] rounded-lg border-2 border-dashed border-gbc-light opacity-30;
    @apply max-sm:w-card-w-sm;
  }
</style>
