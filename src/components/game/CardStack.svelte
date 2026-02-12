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

  // Display rotation: apply on all stacks EXCEPT fan (hand) and fixedSize (deck/prizes).
  // This covers active/bench ("down") and discard zones. Cards in hand stay portrait
  // to avoid revealing identity. Deck/prizes are face-down so rotation is irrelevant.
  const applyDisplayRotation = $derived(stackDirection !== 'fan' && !fixedSize);

  // Multi-card group detection for special card types.
  // NOTE: These heuristics use only the generic `card.template.name` and
  // `card.template.displayRotation` properties (available on all games).
  // Designed for Pokemon V-UNION (4 pieces) and LEGEND (2 halves).
  // Known coupling — acceptable tradeoff vs custom rendering hooks.

  // V-UNION: 4+ same-name cards → 2x2 grid, shrunk to fit
  const vunionGroup = $derived.by(() => {
    if (!applyDisplayRotation || cards.length < 4) return null;
    const nameGroups = new Map<string, typeof cards>();
    for (const card of cards) {
      const name = card.template.name;
      const group = nameGroups.get(name);
      if (group) group.push(card);
      else nameGroups.set(name, [card]);
    }
    for (const [, group] of nameGroups) {
      if (group.length >= 4) return group.slice(0, 4);
    }
    return null;
  });

  // LEGEND: exactly 2 same-name landscape cards → 2x1 vertical stack, full-size, overflows
  const legendGroup = $derived.by(() => {
    if (!applyDisplayRotation || cards.length < 2 || vunionGroup) return null;
    const nameGroups = new Map<string, typeof cards>();
    for (const card of cards) {
      if (!card.template.displayRotation) continue; // only landscape cards
      const name = card.template.name;
      const group = nameGroups.get(name);
      if (group) group.push(card);
      else nameGroups.set(name, [card]);
    }
    for (const [, group] of nameGroups) {
      if (group.length >= 2) return group.slice(0, 2);
    }
    return null;
  });

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
    // V-UNION grid fits in one card slot — don't add extra height for grouped cards
    if (vunionGroup) return '';
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
  {#if vunionGroup}
    <!-- V-UNION: 2x2 grid for 4 same-name cards, shrunk to fit one card slot -->
    {@const otherCards = cards.filter(c => !vunionGroup.includes(c))}
    {#each otherCards as card, i (card.instanceId)}
      <div class="stack-card offset-none" style="--i: {i}; z-index: {i + 1}">
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
    <div class="vunion-grid" style="z-index: {otherCards.length + 1}">
      {#each vunionGroup as card, i (card.instanceId)}
        <div class="vunion-cell">
          <Card
            {card}
            index={otherCards.length + i}
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
  {:else if legendGroup}
    <!-- LEGEND: 2 landscape halves stacked vertically, full-size, overflows zone -->
    {@const otherCards = cards.filter(c => !legendGroup.includes(c))}
    {#each otherCards as card, i (card.instanceId)}
      <div class="stack-card offset-none" style="--i: {i}; z-index: {i + 1}">
        <Card
          {card}
          index={i}
          {zoneKey}
          isDropTarget={true}
          {cardBack}
          {counterDefinitions}
          {renderFace}
          {applyDisplayRotation}
          {onPreview}
          {onToggleVisibility}
          {onCardDrop}
          {onCounterDrop}
        />
      </div>
    {/each}
    {#each legendGroup as card, i (card.instanceId)}
      <div
        class="stack-card legend-offset"
        style="--i: {i}; --legend-base: {otherCards.length}; z-index: {otherCards.length + i + 1}"
      >
        <Card
          {card}
          index={otherCards.length + i}
          {zoneKey}
          isDropTarget={true}
          {cardBack}
          {counterDefinitions}
          {renderFace}
          {applyDisplayRotation}
          {onPreview}
          {onToggleVisibility}
          {onCardDrop}
          {onCounterDrop}
        />
      </div>
    {/each}
  {:else}
    {#each cards as card, i (card.instanceId)}
      {@const isInPacket = isShuffling && shufflePacketStart >= 0 && i >= shufflePacketStart}
      {@const isLandscapeCard = applyDisplayRotation && !!card.template.displayRotation}
      <div
        class="stack-card"
        class:offset-down={stackDirection === 'down'}
        class:offset-up={stackDirection === 'up'}
        class:offset-right={stackDirection === 'right'}
        class:offset-none={stackDirection === 'none'}
        class:offset-fan={stackDirection === 'fan'}
        class:landscape-shift={isLandscapeCard}
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
          {applyDisplayRotation}
          {onPreview}
          {onToggleVisibility}
          {onCardDrop}
          {onCounterDrop}
        />
      </div>
    {/each}
  {/if}
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

  /* LEGEND: two landscape halves stacked vertically, full-size.
   * Each card is W wide × H tall in layout, but visually H wide × W tall after 90° rotation.
   * The visual height of each landscape card = card width (W).
   * Space the second card below the first by W (one card width).
   * Subtract W/5 to pin each card's visual top edge to the layout position
   * (compensates for rotation around center displacing the top edge down by W/5). */
  /* BREAK: landscape card shifted up so it's halfway outside the zone.
   * A 5:7 card rotated 90° has visual center at H/2 = 0.7W below wrapper top.
   * Pulling the wrapper up by 0.7W puts the visual center at the top edge,
   * so half the rotated card overflows above and half sits below. */
  .stack-card.offset-down.landscape-shift {
    top: calc(var(--i) * var(--stack-offset, 1.5rem) - var(--spacing-card-w) * var(--zone-scale, 1) * 7 / 10);
  }

  .stack-card.legend-offset {
    top: calc(var(--i) * var(--spacing-card-w) * var(--zone-scale, 1) - var(--spacing-card-w) * var(--zone-scale, 1) / 5);
    left: 0;
  }

  /* V-UNION: 2x2 grid, scaled to fit one card slot */
  .vunion-grid {
    @apply absolute;
    top: 0;
    left: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    width: calc(var(--spacing-card-w) * var(--zone-scale, 1));
    aspect-ratio: 5 / 7;
    gap: 0;
  }

  .vunion-cell {
    @apply overflow-hidden;
  }

  .vunion-cell :global(.card) {
    width: 100% !important;
    height: 100% !important;
    aspect-ratio: auto;
    border-width: 1px;
    border-radius: 0.25rem;
  }
</style>
