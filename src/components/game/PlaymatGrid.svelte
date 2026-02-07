<script lang="ts">
  import type { Playmat, CardInstance, GameState, CardTemplate, CounterDefinition, ZoneConfig, ActionPanel, PlaymatSlot } from '../../core';
  import { VISIBILITY } from '../../core';
  import Zone from './Zone.svelte';
  import ActionPanelView from './ActionPanelView.svelte';

  interface Props {
    playmat: Playmat;
    gameState: GameState<CardTemplate>;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
    actionPanels?: ActionPanel[];
    onActionPanelClick?: (panelId: string, buttonId: string) => void;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDrop?: (cardInstanceId: string, toZoneKey: string, position?: number) => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onZoneContextMenu?: (zoneKey: string, zoneName: string, cardCount: number, zoneConfig: ZoneConfig, x: number, y: number) => void;
    onCounterDrop?: (counterId: string, cardInstanceId: string) => void;
    onBrowse?: (zoneKey: string, zoneName: string) => void;
  }

  let {
    playmat,
    gameState,
    cardBack,
    counterDefinitions = [],
    actionPanels = [],
    onActionPanelClick,
    renderFace,
    onDrop,
    onPreview,
    onToggleVisibility,
    onZoneContextMenu,
    onCounterDrop,
    onBrowse,
  }: Props = $props();

  // Track Zone refs by zoneKey for shuffle access
  let zoneRefs: Record<string, Zone> = $state({});

  // Exported method to trigger shuffle animation on a zone
  export async function shuffleZone(zoneKey: string): Promise<void> {
    await zoneRefs[zoneKey]?.shuffle();
  }

  const layout = $derived(playmat.layout);

  // Dynamic grid template from columnScales
  const gridTemplateColumns = $derived.by(() => {
    const scales = layout.columnScales ?? Array(layout.cols).fill(1.0);
    return scales.map(s => `calc((var(--spacing-card-w) + 1.5rem) * ${s})`).join(' ');
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

  // Get zone by slot - shared zones use bare key, per-player zones use player{N}_ prefix
  function getZone(slot: { id: string; zoneId: string }) {
    const sharedZone = gameState.zones[slot.zoneId];
    if (sharedZone) return sharedZone;

    const playerIndex = slotToPlayer[slot.id] ?? 0;
    const zoneKey = `player${playerIndex + 1}_${slot.zoneId}`;
    return gameState.zones[zoneKey];
  }
</script>

<div
  class="playmat-grid"
  style="
    grid-template-columns: {gridTemplateColumns};
    grid-template-rows: {gridTemplateRows};
  "
>
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
      {@const isBrowsable = onBrowse && isPublic && (slot.stackDirection === 'none' || !slot.stackDirection)}
      <div
        class="grid-slot"
        class:hand-zone={isHandZone}
        class:staging-slot={isStagingZone}
        class:has-cards={isStagingZone && zone.cards.length > 0}
        class:stack-up={slot.stackDirection === 'up'}
        class:active-zone={isActiveZone}
        class:mid-zone={isMidZone}
        class:p1-field={isP1Field}
        style="
          grid-column: {slot.position.col + 1} / span {slot.position.colSpan ?? 1};
          grid-row: {slot.position.row + 1} / span {slot.position.rowSpan ?? 1};
          --zone-scale: {slot.scale ?? 1};
          {slot.align ? `align-self: ${slot.align};` : ''}
        "
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
  {/each}

  <!-- Grouped slots (same row + group name → sub-grid container) -->
  {#each processedSlots.grouped as group (group.key)}
    {@const isP1Group = group.slots.some(s => slotToPlayer[s.id] === 0)}
    {@const hasExplicitPlacement = group.slots.some(s => s.groupRow !== undefined || s.groupCol !== undefined)}
    <div
      class="grid-slot zone-group"
      class:p1-field={isP1Group}
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
      {/each}
    </div>
  {/each}

  <!-- Action panels (attacks + abilities) — aligned with the mid row -->
  {#if onActionPanelClick && actionPanels.length > 0}
    <div
      class="grid-slot actions-slot mid-zone"
      style="grid-column: 1; grid-row: 3;"
    >
      <ActionPanelView
        panels={actionPanels}
        onButtonClick={onActionPanelClick}
      />
    </div>
  {/if}

</div>

<style>
  @reference "../../app.css";

  .playmat-grid {
    display: grid;
    column-gap: 0;
    row-gap: 0;
    padding: 0.5rem;
  }

  .grid-slot {
    @apply flex justify-center items-start;
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
  }

  .actions-slot {
    @apply self-center;
    overflow: visible;
  }

  .actions-slot :global(.action-panel) {
    @apply w-full;
  }

  .staging-slot.has-cards :global(.zone) {
    @apply border-gbc-red;
  }

  .staging-slot.has-cards :global(.zone-label) {
    @apply text-gbc-red bg-gbc-cream;
  }

  @media (max-width: 1024px) {
    .playmat-grid {
      column-gap: 0;
      row-gap: 0;
      padding: 0.25rem;
    }
  }
</style>
