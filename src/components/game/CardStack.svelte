<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core';
  import Card from './Card.svelte';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    stackDirection: 'none' | 'down' | 'right' | 'fan';
    fixedSize?: boolean;
    zoneKey: string;
    cardBack?: string;
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onDragStart?: (cardInstanceId: string, zoneKey: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onCardDrop?: (droppedCardId: string, targetCardId: string, targetIndex: number) => void;
  }

  let {
    cards,
    stackDirection,
    fixedSize = false,
    zoneKey,
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

  // Calculate stack size based on card count and offset (1.5rem = 24px at base, but use rem)
  const stackOffset = 1.5; // rem
  const extraHeight = $derived(Math.max(0, cards.length - 1) * stackOffset);
  const extraWidth = $derived(Math.max(0, cards.length - 1) * stackOffset);
</script>

<div
  class="card-stack"
  style="{stackDirection === 'down' && !fixedSize ? `min-height: calc(var(--spacing-card-w) * 1.4 + ${extraHeight}rem)` : ''}{stackDirection === 'right' && !fixedSize ? `min-width: calc(var(--spacing-card-w) + ${extraWidth}rem)` : ''}"
>
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
        {zoneKey}
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
