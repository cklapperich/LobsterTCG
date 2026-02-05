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

  // Calculate dynamic min-width style
  const stackStyle = $derived.by(() => {
    if (fixedSize) return '';
    if (stackDirection === 'down') {
      return `min-height: calc(var(--spacing-card-w) * 1.4 + ${extraHeight}rem)`;
    }
    if (stackDirection === 'right') {
      return `min-width: calc(var(--spacing-card-w) + ${extraWidth}rem)`;
    }
    if (stackDirection === 'fan') {
      // Fan uses full card width spacing - use CSS calc with card count
      return `min-width: calc(var(--spacing-card-w) * ${cards.length} + ${Math.max(0, cards.length - 1) * 0.5}rem)`;
    }
    return '';
  });
</script>

<div
  class="card-stack"
  class:fan={stackDirection === 'fan'}
  style={stackStyle}
>
  {#each cards as card, i (card.instanceId)}
    <div
      class="stack-card"
      class:offset-down={stackDirection === 'down'}
      class:offset-right={stackDirection === 'right'}
      class:offset-fan={stackDirection === 'fan'}
      style="--i: {i}; z-index: {i + 1}"
    >
      <Card
        {card}
        index={i}
        {zoneKey}
        {isDropTarget}
        {cardBack}
        {renderFace}
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

  /* Fan layout: cards spread out with full card width + small gap */
  .card-stack.fan {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .card-stack.fan .stack-card {
    position: relative;
    top: auto;
    left: auto;
  }

  .stack-card.offset-fan {
    position: relative;
    top: auto;
    left: auto;
  }
</style>
