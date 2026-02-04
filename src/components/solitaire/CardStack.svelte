<script lang="ts">
  import type { CardInstance } from '../../core';
  import type { PlayingCardTemplate } from '../../plugins/solitaire';
  import Card from './Card.svelte';

  interface Props {
    cards: CardInstance<PlayingCardTemplate>[];
    stackDirection: 'none' | 'down' | 'right' | 'fan';
    zoneId: string;
    onDragStart?: (cardInstanceId: string, zoneId: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<PlayingCardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
  }

  let {
    cards,
    stackDirection,
    zoneId,
    onDragStart,
    onDragEnd,
    onPreview,
    onToggleVisibility,
  }: Props = $props();
</script>

<div class="card-stack" class:stack-down={stackDirection === 'down'} class:stack-right={stackDirection === 'right'} class:stack-none={stackDirection === 'none' || stackDirection === 'fan'}>
  {#each cards as card, i (card.instanceId)}
    <div
      class="stack-card"
      class:offset-down={stackDirection === 'down'}
      class:offset-right={stackDirection === 'right'}
      style="--i: {i}; z-index: {i + 1}"
    >
      <Card
        {card}
        index={i}
        {zoneId}
        {onDragStart}
        {onDragEnd}
        {onPreview}
        {onToggleVisibility}
      />
    </div>
  {/each}
</div>

<style>
  @reference "../../app.css";

  .card-stack {
    @apply relative;
    min-width: var(--spacing-card-w);
    min-height: calc(var(--spacing-card-w) * 1.4);
  }

  .stack-down {
    /* Extend height to accommodate cascading cards */
    min-height: calc(var(--spacing-card-w) * 1.4 + 15rem);
  }

  .stack-right {
    /* Extend width to accommodate spread cards */
    min-width: calc(var(--spacing-card-w) + 10rem);
  }

  .stack-card {
    @apply absolute;
    top: 0;
    left: 0;
  }

  .stack-card.offset-down {
    top: calc(var(--i) * 1.5rem);
    left: 0;
  }

  .stack-card.offset-right {
    top: 0;
    left: calc(var(--i) * 1.5rem);
  }
</style>
