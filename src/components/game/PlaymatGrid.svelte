<script lang="ts">
  import type { Playmat, CardInstance, GameState, CardTemplate } from '../../core';
  import { makeZoneKey } from '../../core';
  import Zone from './Zone.svelte';

  interface Props {
    playmat: Playmat;
    gameState: GameState<CardTemplate>;
    cardBack?: string;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDrop?: (cardInstanceId: string, toZoneId: string, position?: number) => void;
    onDragStart?: (cardInstanceId: string, zoneId: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onZoneContextMenu?: (zoneId: string, zoneName: string, cardCount: number, x: number, y: number) => void;
  }

  let {
    playmat,
    gameState,
    cardBack,
    renderFace,
    onDrop,
    onDragStart,
    onDragEnd,
    onPreview,
    onToggleVisibility,
    onZoneContextMenu,
  }: Props = $props();

  const layout = $derived(playmat.layout);

  // Get zone by slot's zoneId
  function getZone(zoneId: string) {
    const zoneKey = makeZoneKey(0, zoneId); // Single-player (player 0)
    return gameState.zones[zoneKey];
  }

  // Get staging zone
  const stagingZone = $derived(gameState.zones[makeZoneKey(0, 'staging')]);
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
    {@const zone = getZone(slot.zoneId)}
    {#if zone}
      <div
        class="grid-slot"
        style="
          grid-column: {slot.position.col + 1} / span {slot.position.colSpan ?? 1};
          grid-row: {slot.position.row + 1} / span {slot.position.rowSpan ?? 1};
        "
      >
        <Zone
          {zone}
          {slot}
          {cardBack}
          {renderFace}
          {onDrop}
          {onDragStart}
          {onDragEnd}
          {onPreview}
          {onToggleVisibility}
          {onZoneContextMenu}
        />
      </div>
    {/if}
  {/each}

  <!-- Staging zone - always present, in extra row below playmat -->
  {#if stagingZone}
    <div
      class="grid-slot staging-slot"
      class:has-cards={stagingHasCards}
      style="grid-column: 1; grid-row: {layout.rows + 1};"
    >
      <Zone
        zone={stagingZone}
        slot={{ id: 'staging', zoneId: 'staging', position: { row: layout.rows, col: 0 }, stackDirection: 'down' }}
        {cardBack}
        {renderFace}
        {onDrop}
        {onDragStart}
        {onDragEnd}
        {onPreview}
        {onToggleVisibility}
        {onZoneContextMenu}
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
    @apply flex justify-center;
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
