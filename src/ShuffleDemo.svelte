<script lang="ts">
  let deckSize = $state(60);
  let previewCard = $state<string | null>(null);
  let shuffling = $state(false);
  let currentPacketStart = $state(-1);  // -1 = no active packet
  const PACKET_SIZE = 12;  // Cards per packet
  const SHUFFLE_REPS = 4;  // Number of overhand motions

  // Generate array for iteration
  let deckIndices = $derived([...Array(deckSize).keys()]);

  const cardImages = [
    'card-images/base1-1.png',
    'card-images/base1-2.png',
    'card-images/base1-3.png',
    'card-images/base1-4.png',
    'card-images/base1-5.png',
    'card-images/base1-6.png',
    'card-images/base1-7.png',
    'card-images/base1-8.png',
    'card-images/base1-9.png',
    'card-images/base1-10.png',
  ];

  async function shuffle() {
    if (shuffling || deckSize < 2) return;
    shuffling = true;

    // Do multiple overhand motions
    for (let rep = 0; rep < SHUFFLE_REPS; rep++) {
      // Mark which cards are in the current packet (top cards)
      currentPacketStart = Math.max(0, deckSize - PACKET_SIZE);

      // Wait for animation
      await new Promise(r => setTimeout(r, 300));

      currentPacketStart = -1;
      await new Promise(r => setTimeout(r, 100));  // Brief pause between reps
    }

    shuffling = false;
  }

  function adjustDeck(delta: number) {
    deckSize = Math.max(1, Math.min(60, deckSize + delta));
  }

  function showPreview(cardSrc: string) {
    previewCard = cardSrc;
  }
</script>

<div class="game-container font-retro bg-gbc-bg min-h-screen w-screen p-4 box-border relative overflow-hidden">
  <div class="scanlines"></div>

  <header class="gbc-panel text-center mb-6">
    <h1 class="text-gbc-yellow text-2xl max-sm:text-base m-0 tracking-wide title-shadow">LOBSTER TCG</h1>
    <div class="text-gbc-light text-[0.6rem] mt-2 tracking-wider">DECK SHUFFLE DEMO</div>
  </header>

  <div class="flex gap-16 justify-center items-start p-4 max-lg:flex-col max-lg:items-center">
    <div class="flex flex-col gap-8 items-center">
      <div class="gbc-panel">
        <div class="zone-label">DECK</div>

        <div class="relative w-deck-w h-deck-h flex justify-center items-center">
          <div class="relative">
            {#each deckIndices as i}
              <button
                type="button"
                class="card stacked"
                class:animate-overhand-lift={currentPacketStart >= 0 && i >= currentPacketStart}
                class:z-[200]={currentPacketStart >= 0 && i >= currentPacketStart}
                style="--i: {i}"
                onclick={() => showPreview('Pokemon_Trading_Card_Game_cardback.png')}
              >
                <img src="Pokemon_Trading_Card_Game_cardback.png" alt="card back" />
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="gbc-panel">
        <div class="zone-label">SAMPLE CARDS</div>
        <div class="flex gap-2 max-sm:gap-1 justify-center py-4 px-2">
          {#each cardImages.slice(0, 5) as card, i}
            <button
              type="button"
              class="card hand-card"
              style="--i: {i}"
              onclick={() => showPreview(card)}
            >
              <img src={card} alt="pokemon card" />
            </button>
          {/each}
        </div>

        <div class="flex flex-col items-center gap-4 mt-4">
          <div class="gbc-panel flex items-center gap-2 py-2 px-4">
            <button class="size-btn" onclick={() => adjustDeck(-1)} disabled={deckSize <= 1}>−</button>
            <span class="text-[0.6rem] text-gbc-yellow min-w-20 text-center">{deckSize} CARDS</span>
            <button class="size-btn" onclick={() => adjustDeck(1)} disabled={deckSize >= 60}>+</button>
          </div>

          <button class="gbc-btn text-[0.7rem] py-4 px-8 flex items-center gap-2" onclick={shuffle} disabled={deckSize < 2 || shuffling}>
            <span class="text-base">↻</span>
            <span>SHUFFLE</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Card Preview Panel - always visible on right -->
    <div class="gbc-panel-lg shrink-0 max-lg:order-first">
      <div class="text-gbc-yellow text-[0.5rem] text-center mb-3 py-1 px-2 bg-gbc-border">CARD PREVIEW</div>
      {#if previewCard}
        <div class="preview-card">
          <img src={previewCard} alt="card preview" />
        </div>
      {:else}
        <div class="preview-placeholder">
          CLICK A CARD
        </div>
      {/if}
    </div>
  </div>

  <footer class="text-center mt-6 py-2 text-gbc-dark-green text-[0.45rem] tracking-wider">
    <span>▲ HOVER TO HIGHLIGHT • CLICK TO PREVIEW</span>
  </footer>
</div>

<style>
  @reference "./app.css";

  /* Scanlines overlay - complex gradient */
  .scanlines {
    @apply absolute inset-0 pointer-events-none z-[100];
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 0.125rem,
      rgba(0, 0, 0, 0.03) 0.125rem,
      rgba(0, 0, 0, 0.03) 0.25rem
    );
  }

  /* Title text shadow - complex multi-layer */
  .title-shadow {
    text-shadow:
      0.125rem 0.125rem 0 var(--color-gbc-red),
      0.25rem 0.25rem 0 var(--color-gbc-border);
  }

  /* Base card styles */
  .card {
    @apply w-card-w aspect-[5/7] rounded-lg overflow-hidden bg-transparent border-none p-0 cursor-pointer;
    @apply transition-all duration-200;
    @apply max-sm:w-card-w-sm;
    box-shadow: 0.125rem 0.125rem 0 rgba(0,0,0,0.2);
  }

  .card img {
    @apply w-full h-full object-cover block;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
    filter: contrast(1.05) saturate(1.1);
  }

  /* Stacked deck cards - uses CSS custom property for positioning */
  .card.stacked {
    @apply absolute cursor-pointer;
    top: calc(var(--i) * -0.022rem);
    left: calc(var(--i) * 0.01rem);
  }

  /* Hand card hover effect */
  .hand-card:hover {
    @apply z-10 relative;
    transform: translateY(-1.25rem) scale(1.1);
    box-shadow:
      0 0.5rem 0 rgba(0,0,0,0.3),
      0 0 0 0.25rem var(--color-gbc-yellow),
      0 0 1.25rem var(--color-gbc-yellow);
  }

  /* Preview card and placeholder */
  .preview-card {
    @apply w-preview-w h-preview-h rounded-xl overflow-hidden;
    @apply max-lg:w-preview-w-sm max-lg:h-preview-h-sm;
    box-shadow: 0.25rem 0.25rem 0 rgba(0,0,0,0.3);
  }

  .preview-card img {
    @apply w-full h-full object-cover block;
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
    filter: contrast(1.05) saturate(1.1);
  }

  .preview-placeholder {
    @apply w-preview-w h-preview-h rounded-xl bg-gbc-border flex items-center justify-center text-gbc-light text-[0.5rem] opacity-50;
    @apply max-lg:w-preview-w-sm max-lg:h-preview-h-sm;
  }
</style>
