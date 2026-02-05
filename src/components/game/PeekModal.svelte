<script lang="ts">
  import type { CardInstance, CardTemplate } from '../../core';

  interface Props {
    cards: CardInstance<CardTemplate>[];
    zoneName: string;
    position: 'top' | 'bottom';
    renderCardInfo?: (template: CardTemplate) => string;
    onClose: () => void;
  }

  let {
    cards,
    zoneName,
    position,
    renderCardInfo,
    onClose,
  }: Props = $props();

  function getCardDisplay(card: CardInstance<CardTemplate>): string {
    if (renderCardInfo) {
      return renderCardInfo(card.template);
    }
    return card.template.name;
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
  <div class="modal gbc-panel">
    <div class="modal-header">
      <span class="modal-title">Peeking at {position} of {zoneName}</span>
      <button class="close-btn" onclick={onClose}>×</button>
    </div>

    <div class="modal-content">
      <div class="card-list">
        {#each cards as card, i (card.instanceId)}
          <div class="card-row">
            <span class="card-index">{position === 'top' ? cards.length - i : i + 1}</span>
            <span class="card-info">{getCardDisplay(card)}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="modal-footer">
      <button class="gbc-btn" onclick={onClose}>Close</button>
    </div>
  </div>
</div>

<style>
  @reference "../../app.css";

  .modal-backdrop {
    @apply fixed inset-0 z-50 flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .modal {
    @apply min-w-64 max-w-md max-h-[80vh] flex flex-col;
  }

  .modal-header {
    @apply flex justify-between items-center py-2 px-3 bg-gbc-border;
  }

  .modal-title {
    @apply text-gbc-yellow text-[0.5rem];
  }

  .close-btn {
    @apply text-gbc-cream text-lg leading-none bg-transparent border-none cursor-pointer;
    @apply hover:text-gbc-yellow;
  }

  .modal-content {
    @apply p-3 overflow-y-auto flex-1;
  }

  .card-list {
    @apply flex flex-col gap-1;
  }

  .card-row {
    @apply flex items-center gap-2 py-1.5 px-2 bg-gbc-border rounded;
  }

  .card-index {
    @apply text-gbc-yellow text-[0.45rem] w-4 text-center;
  }

  .card-info {
    @apply text-gbc-cream text-[0.5rem] flex-1;
  }

  .modal-footer {
    @apply p-3 flex justify-end border-t-2 border-gbc-border;
  }

  .gbc-btn {
    @apply text-[0.5rem] py-1.5 px-4;
  }
</style>
