<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { cards, onConfirm, onCancel }: Props = $props();
</script>

<div
  class="overlay"
  onclick={onCancel}
  onkeydown={(e) => { if (e.key === 'Escape') onCancel(); }}
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
        <button class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={onCancel}>CANCEL</button>
        <button class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={onConfirm}>END TURN</button>
      </div>
    </div>
  </div>
</div>

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
