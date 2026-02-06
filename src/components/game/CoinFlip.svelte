<script lang="ts">
  import { playSfx } from '../../lib/audio.svelte';

  // Props
  interface Props {
    coinFront: string;
    coinBack: string;
    onResult?: (result: 'heads' | 'tails') => void;
  }

  let { coinFront, coinBack, onResult }: Props = $props();

  // Coin flip state
  let coinFlipping = $state(false);
  let coinResult = $state<'heads' | 'tails' | null>(null);
  let coinShowingFront = $state(true);

  // Expose flipping state for parent to check
  export function isFlipping(): boolean {
    return coinFlipping;
  }

  export async function flip(predeterminedResult?: boolean) {
    if (coinFlipping) return;

    // Reset state and start animation
    coinFlipping = true;
    coinResult = null;

    // Play initial toss sound
    playSfx('coinToss');

    // Determine result — use predetermined if provided, otherwise random
    const isHeads = predeterminedResult ?? Math.random() < 0.5;

    // Animate several flips (12 half-rotations over ~1.5 seconds)
    const flipCount = 12;
    const baseDelay = 80;

    for (let i = 0; i < flipCount; i++) {
      coinShowingFront = !coinShowingFront;
      // Slow down towards the end
      const delay = baseDelay + (i > flipCount - 4 ? (i - (flipCount - 4)) * 40 : 0);
      await new Promise(r => setTimeout(r, delay));
    }

    // Set final result
    coinResult = isHeads ? 'heads' : 'tails';
    coinShowingFront = isHeads;

    // Play result sound
    playSfx(isHeads ? 'coinHeads' : 'coinTails');

    // Notify parent of result
    onResult?.(coinResult);

    // Keep result visible briefly, then reset
    await new Promise(r => setTimeout(r, 800));
    coinFlipping = false;
  }
</script>

{#if coinFlipping}
  <div class="coin-modal-overlay">
    <div class="coin-modal">
      <div class="coin-container" class:showing-result={coinResult !== null}>
        <img
          src={coinShowingFront ? coinFront : coinBack}
          alt="Coin"
          class="coin-image"
          class:flipping={coinResult === null}
        />
      </div>
      {#if coinResult}
        <div class="coin-result text-gbc-yellow text-lg mt-4">
          {coinResult === 'heads' ? 'HEADS!' : 'TAILS!'}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @reference "../../app.css";

  .coin-modal-overlay {
    @apply fixed inset-0 z-50 flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .coin-modal {
    @apply flex flex-col items-center justify-center p-8;
  }

  .coin-container {
    @apply relative;
    perspective: 1000px;
  }

  .coin-image {
    width: 12rem;
    height: 12rem;
    @apply rounded-full object-cover;
    box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.5);
  }

  .coin-image.flipping {
    animation: coin-flip 0.15s linear infinite;
  }

  .coin-container.showing-result .coin-image {
    animation: coin-land 0.3s ease-out forwards;
  }

  .coin-result {
    @apply font-retro tracking-wider;
    text-shadow:
      0.125rem 0.125rem 0 var(--color-gbc-red),
      0.25rem 0.25rem 0 var(--color-gbc-border);
    animation: result-pop 0.3s ease-out;
  }

  @keyframes coin-flip {
    0% { transform: rotateY(0deg) scale(1); }
    50% { transform: rotateY(90deg) scale(1.1); }
    100% { transform: rotateY(180deg) scale(1); }
  }

  @keyframes coin-land {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  @keyframes result-pop {
    0% { transform: scale(0); opacity: 0; }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); opacity: 1; }
  }
</style>
