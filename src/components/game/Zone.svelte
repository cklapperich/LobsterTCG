<script lang="ts">
  import { onMount } from 'svelte';
  import type { Zone as ZoneType, PlaymatSlot, CardInstance, CardTemplate, CounterDefinition, ZoneConfig } from '../../core';
  import CardStack from './CardStack.svelte';
  import { dragStore } from './dragState.svelte';

  interface Props {
    zone: ZoneType<CardTemplate>;
    slot: PlaymatSlot;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDrop?: (cardInstanceId: string, toZoneId: string, position?: number) => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onZoneContextMenu?: (zoneId: string, zoneName: string, cardCount: number, zoneConfig: ZoneConfig, x: number, y: number) => void;
    onCounterDrop?: (counterId: string, cardInstanceId: string) => void;
    onBrowse?: (zoneKey: string, zoneName: string) => void;
  }

  let {
    zone,
    slot,
    cardBack,
    counterDefinitions = [],
    renderFace,
    onDrop,
    onPreview,
    onToggleVisibility,
    onZoneContextMenu,
    onCounterDrop,
    onBrowse,
  }: Props = $props();

  // CardStack ref for shuffle animation
  let cardStackRef: CardStack | undefined = $state();

  // Expose shuffle method via the CardStack ref
  export async function shuffle(): Promise<void> {
    await cardStackRef?.shuffle();
  }

  let isDragOver = $state(false);

  const stackDirection = $derived(slot.stackDirection ?? 'none');
  const label = $derived(slot.label ?? zone.config.name);
  const fixedSize = $derived(slot.fixedSize ?? false);
  const scale = $derived(slot.scale ?? 1);
  const isFull = $derived(
    zone.config.maxCards !== -1 && zone.cards.length >= zone.config.maxCards
  );

  // Hide cards visually when a pile drag originates from this zone
  const displayCards = $derived(
    dragStore.current?.pileCardIds && dragStore.current.fromZoneKey === zone.key
      ? []
      : zone.cards
  );

  let zoneEl: HTMLDivElement;

  onMount(() => {
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onZoneContextMenu?.(zone.key, label, zone.cards.length, zone.config, e.clientX, e.clientY);
      return false;
    }
    zoneEl.addEventListener('contextmenu', handleContextMenu, { capture: true });

    // Browse: capture-phase click so it fires BEFORE Card's preview handler
    function handleBrowseClick(e: MouseEvent) {
      if (!onBrowse || zone.cards.length === 0) return;
      e.stopPropagation();
      e.preventDefault();
      onBrowse(zone.key, label);
    }
    if (onBrowse) {
      zoneEl.addEventListener('click', handleBrowseClick, { capture: true });
    }

    return () => {
      zoneEl.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      if (onBrowse) {
        zoneEl.removeEventListener('click', handleBrowseClick, { capture: true });
      }
    };
  });

  function handleDragOver(event: DragEvent) {
    if (isFull) return; // Don't allow drop → browser shows "no drop" cursor
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  // Zone background drop: hands add to end (rightmost), other zones add to bottom of visual stack
  // Array convention: index 0 = visual bottom, end of array = visual top
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    if (isFull) return;
    const cardInstanceId = event.dataTransfer?.getData('text/plain');
    if (cardInstanceId) {
      const isHandZone = zone.config.id === 'hand';
      if (isHandZone) {
        // Hand zone: add to end (rightmost position)
        onDrop?.(cardInstanceId, zone.key);
      } else {
        // Other zones: add to bottom of visual stack (index 0 = visual bottom)
        onDrop?.(cardInstanceId, zone.key, 0);
      }
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
  data-zone-key={zone.key}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class:browsable={!!onBrowse && displayCards.length > 0}
>
  <div class="zone-label">{label}{slot.showCount && zone.cards.length > 0 ? ` (${zone.cards.length})` : ''}</div>
  <div class="zone-content" class:fixed-size={fixedSize}>
    {#if displayCards.length > 0}
      <CardStack
        bind:this={cardStackRef}
        cards={displayCards}
        {stackDirection}
        {fixedSize}
        {scale}
        zoneKey={zone.key}
        {cardBack}
        {counterDefinitions}
        {renderFace}
        {onPreview}
        {onToggleVisibility}
        onCardDrop={handleCardDrop}
        {onCounterDrop}
      />
    {:else}
      <div class="empty-zone"></div>
    {/if}
  </div>
</div>

<style>
  @reference "../../app.css";

  .zone {
    @apply bg-gbc-dark-green border-4 border-gbc-border px-2 pb-2 pt-0 rounded flex flex-col items-center;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(255,255,255,0.1),
      inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2);
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .zone.browsable {
    @apply cursor-pointer;
  }

  .zone.drag-over {
    @apply border-gbc-yellow;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(255,255,255,0.1),
      inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2),
      0 0 0.5rem var(--color-gbc-yellow);
  }

  .zone-label {
    @apply text-gbc-yellow text-[0.4rem] text-center mb-1 py-0.5 px-1 bg-gbc-border;
    cursor: context-menu;
  }

  .zone-content {
    @apply relative;
    min-height: calc(var(--spacing-card-w) * var(--zone-scale, 1) * 1.4);
  }

  .zone-content.fixed-size {
    max-height: calc(var(--spacing-card-w) * var(--zone-scale, 1) * 1.4);
    overflow: hidden;
  }

  .empty-zone {
    width: calc(var(--spacing-card-w) * var(--zone-scale, 1));
    aspect-ratio: 5 / 7;
    @apply rounded-lg border-2 border-dashed border-gbc-light opacity-30;
  }

  @media (max-width: 640px) {
    .empty-zone {
      width: calc(var(--spacing-card-w-sm) * var(--zone-scale, 1));
    }
  }
</style>
