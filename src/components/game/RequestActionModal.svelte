<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    onSubmit: (value: string) => void;
    onCancel: () => void;
  }

  let { onSubmit, onCancel }: Props = $props();

  let inputValue = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  onMount(() => { inputEl?.focus(); });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    onSubmit(inputValue.trim());
  }
</script>

<div
  class="overlay"
  onclick={onCancel}
  onkeydown={(e) => e.key === 'Escape' && onCancel()}
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
    <div class="text-gbc-yellow text-[0.5rem] text-center py-1 px-2 bg-gbc-border">REQUEST ACTION</div>
    <form class="px-3 py-3 flex flex-col gap-2" onsubmit={handleSubmit}>
      <label for="request-action-input" class="text-gbc-light text-[0.45rem]">Describe what the opponent should do (optional):</label>
      <input
        id="request-action-input"
        type="text"
        class="request-input"
        placeholder="e.g. Discard a card..."
        bind:value={inputValue}
        bind:this={inputEl}
      />
      <div class="flex justify-end gap-2 mt-1">
        <button type="button" class="gbc-btn text-[0.45rem] py-1.5 px-4" onclick={onCancel}>CANCEL</button>
        <button type="submit" class="gbc-btn text-[0.45rem] py-1.5 px-4">SEND</button>
      </div>
    </form>
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

  .request-input {
    @apply w-full bg-gbc-dark-green text-gbc-light text-[0.45rem] px-2 py-1.5 border border-gbc-border rounded-sm font-retro;
    @apply outline-none;
  }

  .request-input::placeholder {
    @apply text-gbc-green/50;
  }

  .request-input:focus {
    @apply border-gbc-green;
  }
</style>
