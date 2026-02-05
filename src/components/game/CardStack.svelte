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

  // Dynamic layout: switch fan to right stacking when too many cards
  const FAN_THRESHOLD = 8;
  const effectiveDirection = $derived(
    stackDirection === 'fan' && cards.length > FAN_THRESHOLD ? 'right' : stackDirection
  );
  // Enable hover-to-top when we've switched from fan to stacked
  const hoverToTop = $derived(stackDirection === 'fan' && cards.length > FAN_THRESHOLD);

  // Calculate stack size based on card count and offset (1.5rem = 24px at base, but use rem)
  const stackOffset = 1.5; // rem
  const extraHeight = $derived(Math.max(0, cards.length - 1) * stackOffset);
  const extraWidth = $derived(Math.max(0, cards.length - 1) * stackOffset);

  // Calculate dynamic min-width style based on effective direction
  const stackStyle = $derived.by(() => {
    if (fixedSize) return '';
    if (effectiveDirection === 'down') {
      return `min-height: calc(var(--spacing-card-w) * 1.4 + ${extraHeight}rem)`;
    }
    if (effectiveDirection === 'right') {
      return `min-width: calc(var(--spacing-card-w) + ${extraWidth}rem)`;
    }
    if (effectiveDirection === 'fan') {
      // Fan uses full card width spacing - use CSS calc with card count
      return `min-width: calc(var(--spacing-card-w) * ${cards.length} + ${Math.max(0, cards.length - 1) * 0.5}rem)`;
    }
    return '';
  });
</script>

<div
  class="card-stack"
  class:fan={effectiveDirection === 'fan'}
  class:hover-to-top={hoverToTop}
  style={stackStyle}
>
  {#each cards as card, i (card.instanceId)}
    <div
      class="stack-card"
      class:offset-down={effectiveDirection === 'down'}
      class:offset-right={effectiveDirection === 'right'}
      class:offset-fan={effectiveDirection === 'fan'}
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

  /* Hover-to-top: when hovering a card in stacked mode, bring it to front */
  .card-stack.hover-to-top .stack-card:hover {
    z-index: 100 !important;
  }
</style>
