<script lang="ts">
  import type { Playmat, CardInstance, GameState, CardTemplate, CounterDefinition, ZoneConfig } from '../../core';
  import { VISIBILITY } from '../../core';
  import Zone from './Zone.svelte';

  interface Props {
    playmat: Playmat;
    gameState: GameState<CardTemplate>;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
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

  // Get zone by slot - uses correct player index based on slot ownership
  function getZone(slot: { id: string; zoneId: string }) {
    const playerIndex = slotToPlayer[slot.id] ?? 0;
    const zoneKey = `player${playerIndex}_${slot.zoneId}`;
    return gameState.zones[zoneKey];
  }

  // Get staging zone
  const stagingZone = $derived(gameState.zones['player0_staging']);
  const stagingHasCards = $derived(stagingZone?.cards.length > 0);
</script>

<div
  class="playmat-grid"
  style="
    --cols: {layout.cols};
    --rows: {layout.rows};
  "
>
  {#each layout.slots as slot (slot.id)}
    {@const zone = getZone(slot)}
    {#if zone}
      {@const isHandZone = slot.zoneId === 'hand'}
      {@const isPublic = zone.config.defaultVisibility[0] && zone.config.defaultVisibility[1]}
      {@const isBrowsable = onBrowse && isPublic && (slot.stackDirection === 'none' || !slot.stackDirection)}
      <div
        class="grid-slot"
        class:hand-zone={isHandZone}
        class:stack-up={slot.stackDirection === 'up'}
        style="
          grid-column: {slot.position.col + 1} / span {slot.position.colSpan ?? 1};
          grid-row: {slot.position.row + 1} / span {slot.position.rowSpan ?? 1};
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

  <!-- Staging zone - always present, in extra row below playmat (columns 7-9) -->
  {#if stagingZone}
    <div
      class="grid-slot staging-slot"
      class:has-cards={stagingHasCards}
      style="grid-column: 9 / span 3; grid-row: {layout.rows};"
    >
      <Zone
        bind:this={zoneRefs[stagingZone.key]}
        zone={stagingZone}
        slot={{ id: 'staging', zoneId: 'staging', position: { row: layout.rows, col: 0 }, stackDirection: 'down' }}
        {cardBack}
        {counterDefinitions}
        {renderFace}
        {onDrop}
        {onPreview}
        {onToggleVisibility}
        {onZoneContextMenu}
        {onCounterDrop}
      />
    </div>
  {/if}
</div>

<style>
  @reference "../../app.css";

  .playmat-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), calc(var(--spacing-card-w) + 1.5rem));
    grid-template-rows: repeat(calc(var(--rows) + 1), auto);
    column-gap: 0.25rem;
    row-gap: 0.5rem;
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

  .staging-slot.has-cards :global(.zone) {
    @apply border-gbc-red;
  }

  .staging-slot.has-cards :global(.zone-label) {
    @apply text-gbc-red bg-gbc-cream;
  }

  @media (max-width: 1024px) {
    .playmat-grid {
      grid-template-columns: repeat(var(--cols), calc(7rem + 1.5rem));
      column-gap: 0.125rem;
      row-gap: 0.25rem;
      padding: 0.25rem;
    }
  }
</style>
