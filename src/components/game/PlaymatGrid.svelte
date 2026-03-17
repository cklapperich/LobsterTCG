<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { CardInstance, CardTemplate } from '../../core/types/card';
  import type { ZoneConfig } from '../../core/types/zone';
  import type { Playmat, PlaymatSlot } from '../../core/types/playmat';
  import type { GameState } from '../../core/types/game';
  import type { CounterDefinition } from '../../core/types/counter';
  import type { BoardWidget } from '../../core/types/board-widget';
  import { VISIBILITY } from '../../core/types/card';
  import Zone from './Zone.svelte';
  import BoardWidgetComponent from './BoardWidget.svelte';

  interface Props {
    playmat: Playmat;
    gameState: GameState<CardTemplate>;
    localPlayer?: 0 | 1;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDrop?: (cardInstanceId: string, toZoneKey: string, position?: number) => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onZoneContextMenu?: (zoneKey: string, zoneName: string, cardCount: number, zoneConfig: ZoneConfig, x: number, y: number) => void;
    onCounterDrop?: (counterId: string, cardInstanceId: string) => void;
    onBrowse?: (zoneKey: string, zoneName: string) => void;
    boardWidgets?: BoardWidget[];
    playmatImage?: string;
    children?: Snippet;
  }

  let {
    playmat,
    gameState,
    localPlayer = 0,
    cardBack,
    counterDefinitions = [],
    renderFace,
    onDrop,
    onPreview,
    onToggleVisibility,
    onZoneContextMenu,
    onCounterDrop,
    onBrowse,
    boardWidgets = [],
    playmatImage,
    children,
  }: Props = $props();

  // Index board widgets by slotId for quick lookup
  const widgetsBySlot = $derived.by(() => {
    const map: Record<string, { above: BoardWidget[]; below: BoardWidget[] }> = {};
    for (const w of boardWidgets) {
      if (!map[w.slotId]) map[w.slotId] = { above: [], below: [] };
      map[w.slotId][w.position].push(w);
    }
    return map;
  });

  // Track Zone refs by zoneKey for shuffle access
  let zoneRefs: Record<string, Zone> = $state({});

  // Exported method to trigger shuffle animation on a zone
  export async function shuffleZone(zoneKey: string): Promise<void> {
    await zoneRefs[zoneKey]?.shuffle();
  }

  // Auto-scale to fill available vertical space using CSS zoom
  let gridEl: HTMLDivElement | undefined = $state();
  let zoomFactor: number = $state(1);

  function recalcZoom() {
    if (!gridEl) return;
    const parent = gridEl.parentElement;
    if (!parent) return;
    // Reset zoom and shrink-wrap height to measure natural content size
    gridEl.style.zoom = '1';
    gridEl.style.height = 'fit-content';
    gridEl.style.width = 'fit-content';
    void gridEl.offsetHeight; // force reflow
    const naturalRect = gridEl.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Restore auto sizing
    gridEl.style.height = '';
    gridEl.style.width = '';
    if (naturalRect.height > 0 && parentRect.height > 0) {
      const zoomH = parentRect.height / naturalRect.height;
      const zoomW = parentRect.width / naturalRect.width;
      // Tiny nudge to eliminate sub-pixel rounding slivers
      zoomFactor = Math.min(zoomH, zoomW) * 1.002;
    }
    gridEl.style.zoom = `${zoomFactor}`;
  }

  onMount(() => {
    requestAnimationFrame(() => recalcZoom());
    const ro = new ResizeObserver(() => recalcZoom());
    if (gridEl?.parentElement) ro.observe(gridEl.parentElement);
    return () => ro.disconnect();
  });

  const layout = $derived(playmat.layout);

  // Dynamic grid template from columnScales
  const gridTemplateColumns = $derived.by(() => {
    const scales = layout.columnScales ?? Array(layout.cols).fill(1.0);
    return scales.map(s => `calc(var(--spacing-card-w) * ${s} + 1.5rem)`).join(' ');
  });

  const gridTemplateRows = $derived.by(() => {
    return (layout.rowHeights ?? Array(layout.rows).fill('auto')).join(' ');
  });

  // Build slot ID -> player index lookup from playerSlots
  const slotToPlayer = $derived.by(() => {
    const map: Record<string, 0 | 1> = {};
    if (playmat.playerSlots) {
      for (const [playerIdx, slotIds] of Object.entries(playmat.playerSlots)) {
        for (const slotId of slotIds) {
          map[slotId] = Number(playerIdx) as 0 | 1;
        }
      }
    }
    return map;
  });

  // Group slots by (row, group) — compute col span from min/max col of slots
  type SlotGroup = { key: string; row: number; col: number; colSpan: number; groupCols: number; groupRows: number; slots: PlaymatSlot[] };

  const processedSlots = $derived.by(() => {
    const grouped: SlotGroup[] = [];
    const standalone: PlaymatSlot[] = [];
    const groupMap = new Map<string, SlotGroup>();

    for (const slot of layout.slots) {
      if (slot.group) {
        const key = `${slot.position.row},${slot.group}`;
        let group = groupMap.get(key);
        if (!group) {
          group = { key, row: slot.position.row, col: slot.position.col, colSpan: 1, groupCols: 1, groupRows: 1, slots: [] };
          groupMap.set(key, group);
          grouped.push(group);
        }
        group.slots.push(slot);
        // Update col span from min/max col
        const minCol = Math.min(group.col, slot.position.col);
        const maxCol = Math.max(group.col + group.colSpan - 1, slot.position.col);
        group.col = minCol;
        group.colSpan = maxCol - minCol + 1;
        // Update internal grid dimensions from groupRow/groupCol
        if (slot.groupRow !== undefined) group.groupRows = Math.max(group.groupRows, slot.groupRow + 1);
        if (slot.groupCol !== undefined) group.groupCols = Math.max(group.groupCols, slot.groupCol + 1);
      } else {
        standalone.push(slot);
      }
    }

    return { grouped, standalone };
  });

  // Compute field row range (non-hand slots) for playmat background overlay
  const fieldRowRange = $derived.by(() => {
    let min = Infinity, max = -Infinity;
    for (const slot of layout.slots) {
      if (slot.zoneId !== 'hand') {
        min = Math.min(min, slot.position.row);
        const slotEnd = slot.position.row + (slot.position.rowSpan ?? 1) - 1;
        max = Math.max(max, slotEnd);
      }
    }
    // Convert to 1-indexed CSS grid-row (start inclusive, end exclusive)
    return { start: min + 1, end: max + 2 };
  });

  // When viewing as player 1 (P2), swap which player's zones appear in each slot
  // so the local player's zones always render at the bottom of the board.
  function perspectiveIndex(rawIndex: 0 | 1): 0 | 1 {
    return localPlayer === 1 ? ((1 - rawIndex) as 0 | 1) : rawIndex;
  }

  // Get zone by slot - shared zones use bare key, per-player zones use player{N}_ prefix
  function getZone(slot: { id: string; zoneId: string }) {
    const sharedZone = gameState.zones[slot.zoneId];
    if (sharedZone) return sharedZone;

    const playerIndex = perspectiveIndex(slotToPlayer[slot.id] ?? 0);
    const zoneKey = `player${playerIndex + 1}_${slot.zoneId}`;
    return gameState.zones[zoneKey];
  }

  function getZoneKey(slot: { id: string; zoneId: string }): string {
    if (gameState.zones[slot.zoneId]) return slot.zoneId;
    const playerIndex = perspectiveIndex(slotToPlayer[slot.id] ?? 0);
    return `player${playerIndex + 1}_${slot.zoneId}`;
  }
</script>

<div
  bind:this={gridEl}
  class="playmat-grid"
  class:has-playmat-image={!!playmatImage}
  style="
    grid-template-columns: {gridTemplateColumns};
    grid-template-rows: {gridTemplateRows};
    zoom: {zoomFactor};
  "
>
  <!-- Playmat background overlay — covers only field rows, not hands -->
  {#if playmatImage}
    <div
      class="playmat-bg"
      style="
        grid-row: {fieldRowRange.start} / {fieldRowRange.end};
        grid-column: 1 / -1;
        background-image: url({playmatImage});
      "
    ></div>
  {/if}

  <!-- Standalone slots (no group) -->
  {#each processedSlots.standalone as slot (slot.id)}
    {@const zone = getZone(slot)}
    {#if zone}
      {@const isHandZone = slot.zoneId === 'hand'}
      {@const isStagingZone = slot.zoneId === 'staging'}
      {@const isStadiumZone = slot.zoneId === 'stadium'}
      {@const isActiveZone = slot.zoneId === 'active'}
      {@const isMidZone = isStagingZone || isStadiumZone}
      {@const isP1Field = slotToPlayer[slot.id] === 0 && !isHandZone}
      {@const isPublic = zone.config.defaultVisibility[0] && zone.config.defaultVisibility[1]}
      {@const isMaxOne = zone.config.maxCards === 1}
      {@const isBrowsable = onBrowse && isPublic && !isMaxOne && (slot.stackDirection === 'none' || !slot.stackDirection)}
      {#if slot.renderMode === 'button'}
        <div
          class="grid-slot"
          style="
            grid-column: {slot.position.col + 1} / span {slot.position.colSpan ?? 1};
            grid-row: {slot.position.row + 1} / span {slot.position.rowSpan ?? 1};
          "
        >
          <button
            class="zone-button"
            onclick={() => onBrowse?.(getZoneKey(slot), slot.label ?? slot.zoneId)}
          >
            {slot.label ?? slot.zoneId} ({zone.cards.length})
          </button>
        </div>
      {:else}
        {@const slotWidgets = widgetsBySlot[slot.id]}
        <div
          class="grid-slot"
          class:hand-zone={isHandZone}
          class:staging-slot={isStagingZone}
          class:has-cards={isStagingZone && zone.cards.length > 0}
          class:stack-up={slot.stackDirection === 'up'}
          class:active-zone={isActiveZone}
          class:mid-zone={isMidZone}
          class:p1-field={isP1Field}
          class:has-widgets={!!slotWidgets}
          style="
            grid-column: {slot.position.col + 1} / span {slot.position.colSpan ?? 1};
            grid-row: {slot.position.row + 1} / span {slot.position.rowSpan ?? 1};
            --zone-scale: {slot.scale ?? 1};
            {slot.align ? `align-self: ${slot.align};` : ''}
          "
        >
          {#if slotWidgets?.above}
            {#each slotWidgets.above as w (w.id)}
              <BoardWidgetComponent widget={w} />
            {/each}
          {/if}
          <Zone
            bind:this={zoneRefs[zone.key]}
            {zone}
            {slot}
            {cardBack}
            {counterDefinitions}
            viewingPlayer={localPlayer}
            {renderFace}
            {onDrop}
            {onPreview}
            {onToggleVisibility}
            {onZoneContextMenu}
            {onCounterDrop}
            onBrowse={isBrowsable ? onBrowse : undefined}
          />
          {#if slotWidgets?.below}
            {#each slotWidgets.below as w (w.id)}
              <BoardWidgetComponent widget={w} />
            {/each}
          {/if}
        </div>
      {/if}
    {/if}
  {/each}

  <!-- Grouped slots (same row + group name → sub-grid container) -->
  {#each processedSlots.grouped as group (group.key)}
    {@const isP1Group = group.slots.some(s => slotToPlayer[s.id] === 0)}
    {@const hasExplicitPlacement = group.slots.some(s => s.groupRow !== undefined || s.groupCol !== undefined)}
    {@const allButtonMode = group.slots.every(s => s.renderMode === 'button')}
    <div
      class="grid-slot zone-group"
      class:p1-field={isP1Group}
      class:button-group={allButtonMode}
      style="
        grid-column: {group.col + 1} / span {group.colSpan};
        grid-row: {group.row + 1};
        --zone-scale: {group.slots[0]?.scale ?? 1};
        {hasExplicitPlacement ? `grid-template-columns: repeat(${group.groupCols}, 1fr);` : ''}
      "
    >
      {#each group.slots as slot (slot.id)}
        {@const zone = getZone(slot)}
        {#if zone}
          {@const isPublic = zone.config.defaultVisibility[0] && zone.config.defaultVisibility[1]}
          {@const isBrowsable = onBrowse && isPublic && (slot.stackDirection === 'none' || !slot.stackDirection)}
          {@const hasPlacement = slot.groupRow !== undefined || slot.groupCol !== undefined}
          {#if slot.renderMode === 'button'}
            <div
              class="zone-group-item"
              style="{hasPlacement ? `grid-row: ${(slot.groupRow ?? 0) + 1}; grid-column: ${(slot.groupCol ?? 0) + 1};` : ''}"
            >
              <button
                class="zone-button"
                onclick={() => onBrowse?.(getZoneKey(slot), slot.label ?? slot.zoneId)}
              >
                {slot.label ?? slot.zoneId} ({zone.cards.length})
              </button>
            </div>
          {:else}
            <div
              class="zone-group-item"
              style="{hasPlacement ? `grid-row: ${(slot.groupRow ?? 0) + 1}; grid-column: ${(slot.groupCol ?? 0) + 1};` : ''}"
            >
              <Zone
                bind:this={zoneRefs[zone.key]}
                {zone}
                {slot}
                {cardBack}
                {counterDefinitions}
                {renderFace}
                {onDrop}
                {onPreview}
                {onToggleVisibility}
                {onZoneContextMenu}
                {onCounterDrop}
                onBrowse={isBrowsable ? onBrowse : undefined}
              />
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  {/each}

  {@render children?.()}
</div>

<style>
  @reference "../../app.css";

  .playmat-grid {
    display: grid;
    column-gap: 0;
    row-gap: 0;
    position: relative;
    width: fit-content;
  }

  .grid-slot {
    @apply flex justify-center items-start;
    position: relative;
    z-index: 1;
    min-width: 0;
  }

  .grid-slot.has-widgets {
    @apply flex-col items-center justify-start;
  }

  .grid-slot.stack-up {
    @apply items-end;
  }

  .grid-slot.hand-zone {
    @apply justify-start;
  }

  .grid-slot.hand-zone :global(.zone) {
    width: 100%;
  }

  .grid-slot.hand-zone :global(.zone-content) {
    width: 100%;
  }

  .grid-slot.hand-zone :global(.empty-zone) {
    @apply border-0;
  }

  .grid-slot.active-zone {
    overflow: visible;
    z-index: 10;
  }

  .grid-slot.mid-zone {
    overflow: visible;
    z-index: 5;
  }

  .grid-slot.p1-field {
    align-self: end;
  }

  .zone-group {
    display: grid;
    gap: 0;
    align-self: start;
    align-items: center;
    justify-items: center;
    min-width: 0;
  }

  .zone-group.button-group {
    gap: 0.25rem;
    align-items: start;
    justify-items: stretch;
  }

  .zone-button {
    @apply text-[0.65rem] py-1.5 px-2 w-full;
    @apply bg-gbc-dark-green border border-gbc-border rounded-sm;
    @apply text-gbc-cream font-retro cursor-pointer;
    @apply hover:bg-gbc-border hover:text-gbc-yellow;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
  }

  .staging-slot.has-cards :global(.zone) {
    @apply border-gbc-red;
  }

  .staging-slot.has-cards :global(.zone-label) {
    @apply text-gbc-red bg-gbc-cream;
  }

  /* Playmat background overlay — sits behind field zones */
  .playmat-bg {
    background-size: cover;
    background-position: center;
    border-radius: 0.5rem;
    z-index: 0;
  }

  /* Playmat image: make non-hand zone backgrounds transparent */
  .playmat-grid.has-playmat-image .grid-slot:not(.hand-zone) :global(.zone) {
    background-color: transparent;
    box-shadow: none;
  }

  .playmat-grid.has-playmat-image .grid-slot:not(.hand-zone) :global(.zone.drag-over) {
    background-color: rgba(48, 104, 80, 0.3);
    box-shadow: 0 0 0.5rem var(--color-gbc-yellow);
  }

  @media (max-width: 1024px) {
    .playmat-grid {
      column-gap: 0;
      row-gap: 0;
    }
  }
</style>
