<script lang="ts">
  import type { Playmat, CardInstance } from '../../core';
  import type { SolitaireGameState, PlayingCardTemplate } from '../../plugins/solitaire';
  import { makeZoneKey } from '../../core';
  import Zone from './Zone.svelte';

  interface Props {
    playmat: Playmat;
    gameState: SolitaireGameState;
    onDrop?: (cardInstanceId: string, toZoneId: string) => void;
    onDragStart?: (cardInstanceId: string, zoneId: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<PlayingCardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
  }

  let {
    playmat,
    gameState,
    onDrop,
    onDragStart,
    onDragEnd,
    onPreview,
    onToggleVisibility,
  }: Props = $props();

  const layout = $derived(playmat.layout);

  // Get zone by slot's zoneId
  function getZone(zoneId: string) {
    const zoneKey = makeZoneKey(0, zoneId); // Solitaire is single-player (player 0)
    return gameState.zones[zoneKey];
  }
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
          {onDrop}
          {onDragStart}
          {onDragEnd}
          {onPreview}
          {onToggleVisibility}
        />
      </div>
    {/if}
  {/each}
</div>

<style>
  @reference "../../app.css";

  .playmat-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), calc(var(--spacing-card-w) + 1.5rem));
    grid-template-rows: repeat(var(--rows), auto);
    column-gap: 0.25rem;
    row-gap: 0.5rem;
    padding: 0.5rem;
  }

  .grid-slot {
    @apply flex justify-center;
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
