<script lang="ts">
  import { playSfx } from '../../lib/audio.svelte';

  let visible = $state(false);
  let flipWinner = $state<0 | 1>(0);
  let resolveCallback: ((p: 0 | 1) => void) | null = null;

  export function show(winner: 0 | 1, resolve: (p: 0 | 1) => void) {
    flipWinner = winner;
    resolveCallback = resolve;
    visible = true;
  }

  function handleChoose(choice: 0 | 1) {
    playSfx('confirm');
    visible = false;
    resolveCallback?.(choice);
    resolveCallback = null;
  }
</script>

{#if visible}
<div class="overlay" role="dialog" aria-modal="true">
  <div
    class="modal gbc-panel"
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
    role="dialog"
    tabindex="-1"
  >
    <div class="text-gbc-yellow text-[1rem] text-center py-2 px-4 bg-gbc-border">COIN FLIP WINNER</div>
    <div class="px-6 py-6 flex flex-col gap-4 items-center">
      <span class="text-gbc-light text-[0.9rem] text-center">Player {flipWinner + 1} won the flip!</span>
      <span class="text-gbc-yellow text-[0.9rem] text-center">Choose your position:</span>
      <div class="flex gap-4 mt-2">
        <button class="gbc-btn text-[0.9rem] py-3 px-8" onclick={() => handleChoose(flipWinner)}>GO FIRST</button>
        <button class="gbc-btn text-[0.9rem] py-3 px-8" onclick={() => handleChoose(flipWinner === 0 ? 1 : 0)}>GO SECOND</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  @reference "../../app.css";

  .overlay {
    @apply fixed inset-0 z-[200] flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .modal {
    @apply w-[40rem];
  }
</style>
