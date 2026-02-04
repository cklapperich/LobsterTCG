<script lang="ts">
  import type { CardInstance } from '../../core';
  import type { PlayingCardTemplate } from '../../plugins/solitaire';
  import { getSuitSymbol } from '../../plugins/solitaire/deck';

  interface Props {
    card: CardInstance<PlayingCardTemplate>;
    index: number;
    draggable?: boolean;
    zoneId: string;
    onDragStart?: (cardInstanceId: string, zoneId: string) => void;
    onDragEnd?: () => void;
    onPreview?: (card: CardInstance<PlayingCardTemplate>) => void;
    onToggleVisibility?: (cardInstanceId: string) => void;
  }

  let {
    card,
    index,
    draggable = true,
    zoneId,
    onDragStart,
    onDragEnd,
    onPreview,
    onToggleVisibility,
  }: Props = $props();

  let isDragging = $state(false);

  // Check if card is face-up (player 0 can see it)
  const isFaceUp = $derived(card.visibility[0]);
  const template = $derived(card.template);
  const suitSymbol = $derived(getSuitSymbol(template.suit));
  const isRed = $derived(template.color === 'red');

  function handleDragStart(event: DragEvent) {
    if (!draggable) return;
    isDragging = true;
    event.dataTransfer?.setData('text/plain', card.instanceId);
    onDragStart?.(card.instanceId, zoneId);
  }

  function handleDragEnd() {
    isDragging = false;
    onDragEnd?.();
  }

  function handleClick() {
    onPreview?.(card);
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    onToggleVisibility?.(card.instanceId);
  }
</script>

<button
  type="button"
  class="card"
  class:face-up={isFaceUp}
  class:face-down={!isFaceUp}
  class:red={isFaceUp && isRed}
  class:black={isFaceUp && !isRed}
  class:dragging={isDragging}
  style="--i: {index}"
  {draggable}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
>
  {#if isFaceUp}
    <div class="card-face">
      <div class="corner top-left">
        <span class="rank">{template.rank}</span>
        <span class="suit">{suitSymbol}</span>
      </div>
      <div class="center-suit">{suitSymbol}</div>
      <div class="corner bottom-right">
        <span class="rank">{template.rank}</span>
        <span class="suit">{suitSymbol}</span>
      </div>
    </div>
  {:else}
    <div class="card-back">
      <div class="back-pattern"></div>
    </div>
  {/if}
</button>

<style>
  @reference "../../app.css";

  .card {
    @apply w-card-w aspect-[5/7] rounded-lg overflow-hidden p-0 cursor-pointer;
    @apply transition-all duration-200 border-4 border-gbc-border;
    @apply max-sm:w-card-w-sm;
    box-shadow: 0.125rem 0.125rem 0 rgba(0,0,0,0.2);
    position: relative;
    user-select: none;
  }

  .card:hover {
    @apply z-10;
    transform: translateY(-0.25rem);
    box-shadow:
      0 0.25rem 0 rgba(0,0,0,0.3),
      0 0 0 0.125rem var(--color-gbc-yellow);
  }

  .card.dragging {
    @apply opacity-50;
    transform: scale(1.05);
  }

  /* Face-up card styles */
  .card.face-up {
    @apply bg-gbc-cream;
  }

  .card.red {
    color: var(--color-gbc-red);
  }

  .card.black {
    color: var(--color-gbc-border);
  }

  .card-face {
    @apply w-full h-full relative font-retro;
  }

  .corner {
    @apply absolute flex flex-col items-center leading-tight;
    font-size: 0.6rem;
  }

  .corner .rank {
    font-size: 0.7rem;
    font-weight: bold;
  }

  .corner .suit {
    font-size: 0.6rem;
  }

  .top-left {
    @apply top-1 left-1;
  }

  .bottom-right {
    @apply bottom-1 right-1;
    transform: rotate(180deg);
  }

  .center-suit {
    @apply absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2;
    font-size: 2rem;
  }

  /* Face-down card styles */
  .card.face-down {
    @apply bg-gbc-blue;
  }

  .card-back {
    @apply w-full h-full flex items-center justify-center;
  }

  .back-pattern {
    @apply w-[85%] h-[90%] rounded border-2 border-gbc-cream;
    background: repeating-linear-gradient(
      45deg,
      var(--color-gbc-dark-green),
      var(--color-gbc-dark-green) 0.25rem,
      var(--color-gbc-blue) 0.25rem,
      var(--color-gbc-blue) 0.5rem
    );
  }
</style>
