<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core';

  interface Props {
    card: CardInstance<CardTemplate>;
    x: number;
    y: number;
    cardBack?: string;
    pileCount?: number;
  }

  let { card, x, y, cardBack, pileCount }: Props = $props();

  const isFaceUp = $derived(card.visibility[0]);
  const template = $derived(card.template);
</script>

<div
  class="drag-overlay"
  style="left: {x}px; top: {y}px;"
>
  <div class="card" class:face-up={isFaceUp} class:face-down={!isFaceUp}>
    {#if isFaceUp}
      {#if template.imageUrl}
        <div class="card-face card-image">
          <img src={template.imageUrl} alt={template.name} />
        </div>
      {:else}
        <div class="card-face card-name">
          <span>{template.name}</span>
        </div>
      {/if}
    {:else}
      <div class="card-back">
        {#if cardBack}
          <img src={cardBack} alt="Card back" class="back-image" />
        {:else}
          <div class="back-pattern"></div>
        {/if}
      </div>
    {/if}
  </div>
  {#if pileCount && pileCount > 1}
    <div class="pile-badge">x{pileCount}</div>
  {/if}
</div>

<style>
  @reference "../../app.css";

  .drag-overlay {
    position: fixed;
    pointer-events: none;
    z-index: 10000;
    transform: translate(-50%, -50%);
  }

  .card {
    @apply w-card-w aspect-[5/7] rounded-lg overflow-hidden p-0;
    @apply border-4 border-gbc-border;
    @apply max-sm:w-card-w-sm;
    box-shadow:
      0 0.5rem 1rem rgba(0, 0, 0, 0.4),
      0 0 0 0.125rem var(--color-gbc-yellow);
  }

  .card.face-up {
    @apply bg-gbc-cream;
  }

  .card.face-down {
    @apply bg-gbc-blue;
  }

  .card-face {
    @apply w-full h-full relative font-retro;
  }

  .card-face.card-image {
    @apply p-0;
  }

  .card-face.card-image img {
    @apply w-full h-full object-cover;
  }

  .card-face.card-name {
    @apply flex items-center justify-center text-center p-2;
    font-size: 0.5rem;
  }

  .card-back {
    @apply w-full h-full flex items-center justify-center;
  }

  .back-image {
    @apply w-full h-full object-cover;
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

  .pile-badge {
    @apply absolute -top-2 -right-2 bg-gbc-red text-gbc-cream font-retro text-[0.5rem] px-1.5 py-0.5 rounded-full;
    @apply border-2 border-gbc-border;
    box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.4);
  }
</style>
