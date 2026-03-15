<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core/types/card';
  import { playSfx } from '../../lib/audio.svelte';

  let visible = $state(false);
  let cards = $state<CardInstance<CardTemplate>[]>([]);
  let confirmCallback: (() => void) | null = null;

  export function show(c: CardInstance<CardTemplate>[], onConfirm: () => void) {
    cards = c;
    confirmCallback = onConfirm;
    visible = true;
  }

  function handleConfirm() {
    visible = false;
    confirmCallback?.();
    confirmCallback = null;
  }

  function handleCancel() {
    visible = false;
    confirmCallback = null;
    playSfx('cancel');
  }
</script>

{#if visible}
<div
  class="overlay"
  onclick={handleCancel}
  onkeydown={(e) => { if (e.key === 'Escape') handleCancel(); }}
  role="button"
  tabindex="-1"
>
  <div
    class="modal gbc-panel"
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
    role="dialog"
    tabindex="-1"
  >
    <div class="text-gbc-yellow text-[0.5rem] text-center py-1 px-2 bg-gbc-border">CARDS IN STAGING</div>
    <div class="px-3 py-3 flex flex-col gap-2">
      <span class="text-gbc-light text-[0.45rem]">
        Staging still has cards: {cards.map(c => c.template.name).join(', ')}
      </span>
      <span class="text-gbc-yellow text-[0.45rem]">End turn anyway?</span>
      <div class="flex justify-end gap-2 mt-1">
        <button class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={handleCancel}>CANCEL</button>
        <button class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={handleConfirm}>END TURN</button>
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
    @apply w-80;
  }
</style>
