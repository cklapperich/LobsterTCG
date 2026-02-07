<script lang="ts">
  import type { CardInstance, CardTemplate, CounterDefinition } from '../../core';
  import Card from './Card.svelte';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    stackDirection: 'none' | 'down' | 'up' | 'right' | 'fan';
    fixedSize?: boolean;
    scale?: number;
    zoneKey: string;
    cardBack?: string;
    counterDefinitions?: CounterDefinition[];
    renderFace?: (template: CardTemplate) => { rank?: string; suit?: string; color?: string };
    onPreview?: (card: CardInstance<CardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
    onCardDrop?: (droppedCardId: string, targetCardId: string, targetIndex: number) => void;
    onCounterDrop?: (counterId: string, cardInstanceId: string) => void;
  }

  let {
    cards,
    stackDirection,
    fixedSize = false,
    scale = 1,
    zoneKey,
    cardBack,
    counterDefinitions = [],
    renderFace,
    onPreview,
    onToggleVisibility,
    onCardDrop,
    onCounterDrop,
  }: Props = $props();

  // Shuffle animation state (managed internally)
  let isShuffling = $state(false);
  let shufflePacketStart = $state(-1);
  const PACKET_SIZE = 12;
  const SHUFFLE_REPS = 4;

  // Exported shuffle method - call this to trigger shuffle animation
  export async function shuffle(): Promise<void> {
    if (isShuffling || cards.length < 2) return;
    isShuffling = true;

    for (let rep = 0; rep < SHUFFLE_REPS; rep++) {
      shufflePacketStart = Math.max(0, cards.length - PACKET_SIZE);
      await new Promise(r => setTimeout(r, 300));
      shufflePacketStart = -1;
      await new Promise(r => setTimeout(r, 100));
    }

    isShuffling = false;
  }

  // Container width for dynamic fan layout
  let containerWidth = $state(0);
  let cardWidth = $state(0);
  let stackEl: HTMLDivElement;

  // Minimum offset so cards remain visible/clickable (in pixels)
  const MIN_OFFSET_PX = 24;
  // Gap between cards when fully spread (in pixels)
  const FULL_SPREAD_GAP_PX = 8;

  // Calculate optimal offset for fan layout based on available space
  const fanOffset = $derived.by(() => {
    if (stackDirection !== 'fan' || cards.length <= 1 || !containerWidth || !cardWidth) {
      return cardWidth + FULL_SPREAD_GAP_PX; // Full spread
    }

    // Space needed for full spread: cardWidth * N + gap * (N-1)
    const fullSpreadWidth = cardWidth * cards.length + FULL_SPREAD_GAP_PX * (cards.length - 1);

    if (fullSpreadWidth <= containerWidth) {
      // All cards fit without overlap
      return cardWidth + FULL_SPREAD_GAP_PX;
    }

    // Calculate offset needed to fit: cardWidth + (N-1) * offset = containerWidth
    // offset = (containerWidth - cardWidth) / (N - 1)
    const neededOffset = (containerWidth - cardWidth) / (cards.length - 1);

    // Clamp to minimum offset
    return Math.max(MIN_OFFSET_PX, neededOffset);
  });

  // Enable hover-to-top when cards are overlapping
  const hoverToTop = $derived(
    stackDirection === 'fan' && cardWidth > 0 && fanOffset < cardWidth
  );

  // Calculate stack size based on card count and offset (1.5rem = 24px at base, but use rem)
  const stackOffset = $derived(1.5 * scale); // rem, scaled
  const extraHeight = $derived(Math.max(0, cards.length - 1) * stackOffset);
  const extraWidth = $derived(Math.max(0, cards.length - 1) * stackOffset);

  // Calculate dynamic min-width style based on direction
  const stackStyle = $derived.by(() => {
    if (fixedSize) return '';
    if (stackDirection === 'down') {
      return `min-height: calc(var(--spacing-card-w) * ${scale} * 1.4 + ${extraHeight}rem)`;
    }
    if (stackDirection === 'up') {
      return `min-height: calc(var(--spacing-card-w) * ${scale} * 1.4 + ${extraHeight}rem)`;
    }
    if (stackDirection === 'right') {
      return `min-width: calc(var(--spacing-card-w) * ${scale} + ${extraWidth}rem)`;
    }
    // Fan layout fills container, no min-width needed
    return '';
  });

  // Measure container width and get card width from CSS variable (scaled)
  $effect(() => {
    if (!stackEl) return;

    function measureCardWidth() {
      const styles = getComputedStyle(stackEl);
      const cardWidthValue = styles.getPropertyValue('--spacing-card-w').trim();
      if (cardWidthValue) {
        const remValue = parseFloat(cardWidthValue);
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        cardWidth = remValue * rootFontSize * scale;
      }
    }

    measureCardWidth();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === stackEl) {
          containerWidth = entry.contentRect.width;
          measureCardWidth();
        }
      }
    });

    resizeObserver.observe(stackEl);
    return () => resizeObserver.disconnect();
  });
</script>

<div
  class="card-stack"
  class:fan={stackDirection === 'fan'}
  class:hover-to-top={hoverToTop}
  style={stackStyle}
  bind:this={stackEl}
>
  {#each cards as card, i (card.instanceId)}
    {@const isInPacket = isShuffling && shufflePacketStart >= 0 && i >= shufflePacketStart}
    <div
      class="stack-card"
      class:offset-down={stackDirection === 'down'}
      class:offset-up={stackDirection === 'up'}
      class:offset-right={stackDirection === 'right'}
      class:offset-none={stackDirection === 'none'}
      class:offset-fan={stackDirection === 'fan'}
      class:animate-overhand-lift={isInPacket}
      style="--i: {i}; --fan-offset: {fanOffset}px; --stack-offset: {stackOffset}rem; z-index: {isInPacket ? 200 : i + 1}"
    >
      <Card
        {card}
        index={i}
        {zoneKey}
        isDropTarget={true}
        {cardBack}
        {counterDefinitions}
        {renderFace}
        {onPreview}
        {onToggleVisibility}
        {onCardDrop}
        {onCounterDrop}
      />
    </div>
  {/each}
</div>

<style>
  @reference "../../app.css";

  .card-stack {
    @apply relative;
    min-width: calc(var(--spacing-card-w) * var(--zone-scale, 1));
    min-height: calc(var(--spacing-card-w) * var(--zone-scale, 1) * 1.4);
  }

  .stack-card {
    @apply absolute;
    top: 0;
    left: 0;
  }

  .stack-card.offset-down {
    top: calc(var(--i) * var(--stack-offset, 1.5rem));
    left: 0;
  }

  .stack-card.offset-up {
    top: auto;
    bottom: calc(var(--i) * var(--stack-offset, 1.5rem));
    left: 0;
  }

  .stack-card.offset-right {
    top: 0;
    left: calc(var(--i) * var(--stack-offset, 1.5rem));
  }

  /* No-direction stacking: subtle offset for deck thickness effect */
  .stack-card.offset-none {
    top: calc(var(--i) * -0.022rem);
    left: calc(var(--i) * 0.01rem);
  }

  /* Fan layout: cards positioned with dynamic offset */
  .stack-card.offset-fan {
    top: 0;
    left: calc(var(--i) * var(--fan-offset, 0px));
  }

  /* Hover-to-top: when hovering a card in stacked mode, bring it to front */
  .card-stack.hover-to-top .stack-card:hover {
    z-index: 100 !important;
  }
</style>
