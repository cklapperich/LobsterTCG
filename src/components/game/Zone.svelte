<script lang="ts">
  import { onMount } from 'svelte';
  import type { CardInstance, CardTemplate } from '../../core/types/card';
  import type { ZoneConfig, Zone as ZoneType } from '../../core/types/zone';
  import type { PlaymatSlot } from '../../core/types/playmat';
  import type { CounterDefinition } from '../../core/types/counter';
  import CardStack from './CardStack.svelte';
  import CounterIcon from './CounterIcon.svelte';
  import { dragStore } from './dragState.svelte';
  import {
    counterDragStore,
    startCounterDrag,
    updateCounterDragPosition,
    endCounterDrag,
  } from './counterDragState.svelte';

  interface Props {
    zone: ZoneType<CardTemplate>;
    slot: PlaymatSlot;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
    viewingPlayer?: 0 | 1;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDrop?: (cardInstanceId: string, toZoneId: string, position?: number) => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onZoneContextMenu?: (zoneId: string, zoneName: string, cardCount: number, zoneConfig: ZoneConfig, x: number, y: number) => void;
    onCounterDrop?: (counterId: string, cardInstanceId: string) => void;
    onZoneCounterDrop?: (counterId: string, zoneKey: string) => void;
    onBrowse?: (zoneKey: string, zoneName: string) => void;
  }

  let {
    zone,
    slot,
    cardBack,
    counterDefinitions = [],
    viewingPlayer = 0,
    renderFace,
    onDrop,
    onPreview,
    onToggleVisibility,
    onZoneContextMenu,
    onCounterDrop,
    onZoneCounterDrop,
    onBrowse,
  }: Props = $props();

  // CardStack ref for shuffle animation
  let cardStackRef: CardStack | undefined = $state();

  // Expose shuffle method via the CardStack ref
  export async function shuffle(): Promise<void> {
    await cardStackRef?.shuffle();
  }

  let isDragOver = $state(false);
  let isCounterDragOver = $state(false);

  const stackDirection = $derived(slot.stackDirection ?? 'none');
  const label = $derived(slot.label ?? zone.config.name);
  const fixedSize = $derived(slot.fixedSize ?? false);
  const scale = $derived(slot.scale ?? 1);
  const isFull = $derived(
    zone.config.maxCards !== -1 && zone.cards.length >= zone.config.maxCards
  );

  // Zone-counter zone: renders counters directly instead of cards
  const isZoneCounterZone = $derived(!!zone.config.zoneCounters && zone.config.maxCards === 0);
  const zoneCounterEntries = $derived.by(() => {
    if (!isZoneCounterZone || !zone.counters) return [];
    return Object.entries(zone.counters).filter(([, v]) => v > 0);
  });

  // Find counter definition by ID
  function getCounterDef(counterId: string) {
    return counterDefinitions.find(d => d.id === counterId);
  }

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
    // Counter drag: accept on zone-counter zones (with category check) and regular zones
    if (counterDragStore.current) {
      if (isZoneCounterZone && zone.config.allowedCounterCategories) {
        const def = getCounterDef(counterDragStore.current.counterId);
        if (def?.category && !zone.config.allowedCounterCategories.includes(def.category)) return;
      }
      event.preventDefault();
      isCounterDragOver = true;
      return;
    }
    // Card drag: zone-counter zones don't accept cards
    if (isZoneCounterZone) return;
    if (isFull) return;
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
    isCounterDragOver = false;
  }

  // Zone background drop: handles both card and counter drops
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    isCounterDragOver = false;

    // Counter drop: route to zone-counter handler or card counter handler
    if (counterDragStore.current) {
      const { counterId } = counterDragStore.current;
      if (isZoneCounterZone) {
        // Drop counter directly on zone-counter zone
        onZoneCounterDrop?.(counterId, zone.key);
      } else if (zone.cards.length > 0 && zone.config.canHaveCounters !== false) {
        // Drop counter on top card of a regular zone
        const topCard = zone.cards[zone.cards.length - 1];
        onCounterDrop?.(counterId, topCard.instanceId);
      } else {
        // Drop counter on empty/no-counter zone — route to zone counter handler
        // (Game.svelte / pre-hooks can redirect, e.g. discard → energy_discard)
        onZoneCounterDrop?.(counterId, zone.key);
      }
      return;
    }

    // Card drop
    if (isZoneCounterZone) return;
    if (isFull) return;
    const cardInstanceId = event.dataTransfer?.getData('text/plain');
    if (cardInstanceId) {
      const isHandZone = zone.config.id === 'hand';
      if (isHandZone) {
        onDrop?.(cardInstanceId, zone.key);
      } else {
        onDrop?.(cardInstanceId, zone.key, 0);
      }
    }
  }

  // Card-to-card drop: insert after target card (higher z-index = visually on top)
  function handleCardDrop(droppedCardId: string, _targetCardId: string, targetIndex: number) {
    onDrop?.(droppedCardId, zone.key, targetIndex + 1);
  }

  // Transparent image for suppressing native drag preview on zone counter chips
  const counterTransparentImg = new Image();
  counterTransparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Dragging a counter OUT of a zone-counter zone (native HTML5 DnD)
  function handleZoneCounterDragStart(event: DragEvent, counterId: string) {
    event.stopPropagation();
    event.dataTransfer?.setData('text/plain', `counter:${counterId}`);
    event.dataTransfer?.setDragImage(counterTransparentImg, 0, 0);
    startCounterDrag(counterId, `zone:${zone.key}`, event.clientX, event.clientY);
  }

  function handleZoneCounterDrag(event: DragEvent) {
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateCounterDragPosition(event.clientX, event.clientY);
    }
  }

  function handleZoneCounterDragEnd() {
    endCounterDrag();
  }
</script>

<div
  class="zone"
  class:drag-over={isDragOver || isCounterDragOver}
  class:top-drop-pad={slot.topDropPad}
  role="region"
  aria-label={label}
  bind:this={zoneEl}
  data-zone-key={zone.key}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class:browsable={!!onBrowse && displayCards.length > 0}
>
  {#if isZoneCounterZone}
    <!-- Zone-counter zone: render counters directly -->
    {#if slot.label}
      <div class="zone-label zone-counter-label">{label}</div>
    {/if}
    <div class="zone-counter-content">
      {#if zoneCounterEntries.length > 0}
        {#each zoneCounterEntries as [counterId, quantity] (counterId)}
          {@const def = getCounterDef(counterId)}
          {#if def}
            <div
              class="zone-counter-item"
              draggable="true"
              ondragstart={(e) => handleZoneCounterDragStart(e, counterId)}
              ondrag={handleZoneCounterDrag}
              ondragend={handleZoneCounterDragEnd}
              title="{def.name}: {quantity}"
            >
              <CounterIcon counter={def} {quantity} size="small" showQuantity={true} />
            </div>
          {:else}
            <div class="zone-counter-item zone-counter-fallback">
              <span class="counter-text">{counterId}: {quantity}</span>
            </div>
          {/if}
        {/each}
      {:else}
        <div class="zone-counter-empty"></div>
      {/if}
    </div>
  {:else}
    {#if slot.label && (displayCards.length === 0 || slot.showCount)}
      <div class="zone-label">{label}{slot.showCount && zone.cards.length > 0 ? ` (${zone.cards.length})` : ''}</div>
    {/if}
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
          {viewingPlayer}
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
  {/if}
</div>

<style>
  @reference "../../app.css";

  .zone {
    @apply bg-gbc-dark-green border-4 border-gbc-border px-2 py-2 rounded flex flex-col items-center;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(255,255,255,0.1),
      inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2);
    transition: border-color 0.15s, box-shadow 0.15s;
    position: relative;
  }

  .zone.browsable {
    @apply cursor-pointer;
  }

  .zone.top-drop-pad {
    padding-top: 1.5rem;
  }

  .zone.drag-over {
    @apply border-gbc-yellow;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(255,255,255,0.1),
      inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2),
      0 0 0.5rem var(--color-gbc-yellow);
  }

  .zone-label {
    @apply text-gbc-yellow text-[0.7rem] text-center py-0.5 px-1.5 bg-gbc-border rounded-sm;
    cursor: context-menu;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    opacity: 0.85;
    pointer-events: auto;
    white-space: nowrap;
  }

  .zone-content {
    @apply relative;
    min-height: calc(var(--spacing-card-w) * var(--zone-scale, 1) * 1.4);
  }

  .zone-content.fixed-size {
    max-height: calc(var(--spacing-card-w) * var(--zone-scale, 1) * 1.4);
  }

  .empty-zone {
    width: calc(var(--spacing-card-w) * var(--zone-scale, 1));
    aspect-ratio: 5 / 7;
    @apply rounded-lg border-2 border-dashed border-gbc-light opacity-30;
  }

  /* Zone-counter zone styles */
  .zone-counter-content {
    @apply flex flex-row items-center justify-center gap-1 px-1 py-1;
    min-height: 2.5rem;
  }

  .zone-counter-label {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    z-index: auto;
    @apply text-[0.55rem] opacity-70;
  }

  .zone-counter-item {
    @apply cursor-grab;
  }

  .zone-counter-fallback {
    @apply text-gbc-cream text-[0.5rem] font-retro;
  }

  .zone-counter-empty {
    @apply opacity-30 text-gbc-light text-[0.5rem] font-retro;
    min-width: 2rem;
    min-height: 1.5rem;
  }

  @media (max-width: 640px) {
    .empty-zone {
      width: calc(var(--spacing-card-w-sm) * var(--zone-scale, 1));
    }
  }
</style>
