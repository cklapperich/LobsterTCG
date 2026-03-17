<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core/types/card';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    onClose: () => void;
  }

  let { cards, onClose }: Props = $props();

  function imgFallback(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (img.src.endsWith('.png')) img.src = img.src.replace(/\.png$/, '.webp');
  }
</script>

{#if cards.length > 0}
  <div
    class="preview-overlay"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="button"
    tabindex="-1"
  >
    {#if cards.length === 1}
      {@const card = cards[0]}
      {#if card.template.imageUrl}
        <div class="preview-overlay-card" style="transform: rotate({card.template.displayRotation ?? 0}deg)">
          <img src={card.template.imageUrl} alt={card.template.name} onerror={imgFallback} />
        </div>
      {/if}
    {:else if cards.length === 2}
      <!-- LEGEND: two halves stacked vertically -->
      <div class="preview-composite-legend">
        {#each cards as card}
          {#if card.template.imageUrl}
            <img
              src={card.template.imageUrl}
              alt={card.template.name}
              style="transform: rotate({card.template.displayRotation ?? 0}deg)"
              onerror={imgFallback}
            />
          {/if}
        {/each}
      </div>
    {:else}
      <!-- V-UNION: 2x2 grid -->
      <div class="preview-composite-vunion">
        {#each cards.slice(0, 4) as card}
          {#if card.template.imageUrl}
            <img src={card.template.imageUrl} alt={card.template.name} onerror={imgFallback} />
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  @reference "../../app.css";

  .preview-overlay {
    @apply fixed inset-0 z-[150] flex items-center justify-center cursor-pointer;
    background: rgba(0, 0, 0, 0.75);
  }

  .preview-overlay-card {
    pointer-events: none;
    height: 85vh;
    aspect-ratio: 5 / 7;
    max-width: 90vw;
  }

  .preview-overlay-card img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    @apply rounded-xl;
  }

  /* LEGEND: two portrait halves stacked vertically, each rotated 90° to landscape.
   * CSS rotation doesn't affect layout, so rotated images have dead vertical space.
   * Negative margin collapses that space so the two halves visually touch.
   * Dead space per image ≈ H * (1 - W/H) / 2 = H * 1/7 for a 5:7 card. */
  .preview-composite-legend {
    @apply flex flex-col items-center;
    gap: 0;
    pointer-events: none;
  }

  .preview-composite-legend img {
    height: 40vh;
    aspect-ratio: 5 / 7;
    max-width: 90vw;
    object-fit: contain;
    @apply rounded-xl;
    margin-block: -5.5vh;
  }

  /* V-UNION: 2x2 grid */
  .preview-composite-vunion {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 0.25rem;
    pointer-events: none;
  }

  .preview-composite-vunion img {
    height: 40vh;
    width: 44vw;
    object-fit: contain;
    @apply rounded-xl;
  }
</style>
