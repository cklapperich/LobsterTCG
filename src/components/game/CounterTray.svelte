<script lang="ts">
  import type { CounterDefinition, MarkerState } from '../../core';
  import CounterIcon from './CounterIcon.svelte';
  import {
    startCounterDrag,
    updateCounterDragPosition,
    endCounterDrag,
    counterDragStore,
  } from './counterDragState.svelte';

  interface Props {
    counters: CounterDefinition[];
    onCounterReturn?: () => void;
    markers?: MarkerState[];
    onMarkerClick?: (id: string) => void;
  }

  let { counters, onCounterReturn, markers = [], onMarkerClick }: Props = $props();

  // Group counters by category
  const groupedCounters = $derived(() => {
    const groups: Record<string, CounterDefinition[]> = {};
    for (const counter of counters) {
      const category = counter.category ?? 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(counter);
    }
    // Sort within each group by sortOrder
    for (const category of Object.keys(groups)) {
      groups[category].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return groups;
  });

  let isDragOver = $state(false);

  // Create a transparent 1x1 pixel image for suppressing native drag preview
  const transparentImg = new Image();
  transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function handleDragStart(event: DragEvent, counter: CounterDefinition) {
    event.dataTransfer?.setData('text/plain', `counter:${counter.id}`);
    event.dataTransfer?.setDragImage(transparentImg, 0, 0);
    startCounterDrag(counter.id, 'tray', event.clientX, event.clientY);
  }

  function handleDrag(event: DragEvent) {
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateCounterDragPosition(event.clientX, event.clientY);
    }
  }

  function handleDragEnd() {
    endCounterDrag();
  }

  function handleDragOver(event: DragEvent) {
    const data = event.dataTransfer?.types.includes('text/plain');
    if (data && counterDragStore.current && counterDragStore.current.source !== 'tray') {
      event.preventDefault();
      isDragOver = true;
    }
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    // Only accept counters being returned from cards
    if (counterDragStore.current && counterDragStore.current.source !== 'tray') {
      onCounterReturn?.();
    }
  }
</script>

<div
  class="counter-tray gbc-panel"
  class:drag-over={isDragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="list"
>
  <div class="tray-header">COUNTERS</div>

  {#each Object.entries(groupedCounters()) as [category, categoryCounters]}
    <div class="category">
      <div class="counter-row">
        {#each categoryCounters as counter (counter.id)}
          <div
            class="counter-slot"
            draggable="true"
            ondragstart={(e) => handleDragStart(e, counter)}
            ondrag={handleDrag}
            ondragend={handleDragEnd}
            role="listitem"
            title={counter.name}
          >
            <CounterIcon {counter} size="medium" />
          </div>
        {/each}
      </div>
    </div>
  {/each}

  {#if markers.length > 0}
    <div class="tray-header">MARKERS</div>
    <div class="marker-grid">
      {#each markers as marker (marker.id)}
        <button
          class="marker-btn"
          class:marker-used={marker.used}
          class:marker-clickable={marker.clickable && !marker.used}
          disabled={!marker.clickable || marker.used}
          onclick={() => onMarkerClick?.(marker.id)}
          title="{marker.sublabel} {marker.label}: {marker.used ? 'Used' : 'Available'}"
        >
          <span class="marker-label">{marker.label}</span>
          <span class="marker-sublabel">{marker.sublabel}</span>
          {#if marker.used}
            <span class="marker-used-overlay">USED</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if isDragOver}
    <div class="return-hint">Drop to remove</div>
  {/if}
</div>

<style>
  @reference "../../app.css";

  .counter-tray {
    @apply relative;
  }

  .counter-tray.drag-over {
    @apply border-gbc-red;
    box-shadow: 0 0 0.5rem var(--color-gbc-red);
  }

  .tray-header {
    @apply text-gbc-yellow text-[0.5rem] text-center mb-2 py-1 px-2 bg-gbc-border;
  }

  .category {
    @apply mb-3;
  }

  .category:last-child {
    @apply mb-0;
  }

  .counter-row {
    @apply flex flex-wrap gap-2 px-2;
  }

  .counter-slot {
    @apply flex flex-col items-center gap-1 cursor-grab;
    @apply p-1 rounded transition-transform;
  }

  .counter-slot:hover {
    @apply bg-gbc-border/50;
    transform: scale(1.05);
  }

  .counter-slot:active {
    @apply cursor-grabbing;
  }

  .return-hint {
    @apply absolute inset-0 flex items-center justify-center;
    @apply bg-gbc-red/80 text-gbc-cream text-[0.5rem] font-retro;
    @apply rounded pointer-events-none;
  }

  .marker-grid {
    @apply grid grid-cols-2 gap-1.5 px-2 mb-2;
  }

  .marker-btn {
    @apply relative flex flex-col items-center justify-center;
    @apply py-1.5 px-2 rounded-sm border-2 border-gbc-green;
    @apply bg-gbc-dark-green text-gbc-green font-retro;
    @apply transition-all cursor-default;
    min-height: 2.2rem;
  }

  .marker-clickable {
    @apply cursor-pointer;
  }

  .marker-clickable:hover {
    @apply bg-gbc-green/20 border-gbc-yellow;
    transform: scale(1.03);
  }

  .marker-used {
    @apply border-gbc-red/60 opacity-50;
  }

  .marker-label {
    @apply text-[0.55rem] leading-tight font-bold;
  }

  .marker-sublabel {
    @apply text-[0.4rem] leading-tight text-gbc-light/60;
  }

  .marker-used-overlay {
    @apply absolute inset-0 flex items-center justify-center;
    @apply text-gbc-red text-[0.45rem] font-bold;
    @apply bg-gbc-dark-green/70;
  }
</style>
