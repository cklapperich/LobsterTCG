<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core';
  import Card from './Card.svelte';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    stackDirection: 'none' | 'down' | 'right' | 'fan';
    zoneId: string;
    cardBack?: string;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDragStart?: (cardInstanceId: string, zoneId: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onCardDrop?: (droppedCardId: string, targetCardId: string, targetIndex: number) => void;
  }

  let {
    cards,
    stackDirection,
    zoneId,
    cardBack,
    renderFace,
    onDragStart,
    onDragEnd,
    onPreview,
    onToggleVisibility,
    onCardDrop,
  }: Props = $props();

  // All cards can be drop targets
  const isDropTarget = true;
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
        {isDropTarget}
        {cardBack}
        {renderFace}
        {onDragStart}
        {onDragEnd}
        {onPreview}
        {onToggleVisibility}
        {onCardDrop}
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
    min-height: calc(var(--spacing-card-w) * 1.4 + 15rem);
  }

  .stack-right {
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
