<script lang="ts">
  import type { ActionPanel } from '../../core';
  import { playSfx } from '../../lib/audio.svelte';

  interface Props {
    panels: ActionPanel[];
    onButtonClick: (panelId: string, buttonId: string) => void;
  }

  let { panels, onButtonClick }: Props = $props();

  function handleClick(panelId: string, buttonId: string) {
    playSfx('confirm');
    onButtonClick(panelId, buttonId);
  }
</script>

{#each panels as panel (panel.id)}
  <div class="gbc-panel action-panel">
    {#if panel.title}
      <div class="panel-header">{panel.title}</div>
    {/if}
    {#if panel.buttons.length > 0}
      <div class="panel-buttons">
        {#each panel.buttons as btn (btn.id)}
          <button
            class="action-btn"
            disabled={btn.disabled}
            title={btn.tooltip}
            onclick={() => handleClick(panel.id, btn.id)}
          >
            <span class="action-label">{btn.label}</span>
            {#if btn.sublabel}
              <span class="action-sublabel">{btn.sublabel}</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else if panel.emptyMessage}
      <div class="empty-message">{panel.emptyMessage}</div>
    {/if}
  </div>
{/each}

<style>
  @reference "../../app.css";

  .action-panel {
    @apply max-lg:w-auto;
  }

  .panel-header {
    @apply text-gbc-yellow text-[0.5rem] text-center mb-2 py-1 px-2 bg-gbc-border;
  }

  .panel-buttons {
    @apply flex flex-col gap-2 px-2 pb-2;
  }

  .action-btn {
    @apply w-full flex flex-col items-center py-3 px-4;
    @apply bg-gbc-dark-green border-2 border-gbc-border rounded;
    @apply text-gbc-light font-retro cursor-pointer;
    @apply transition-colors;
  }

  .action-btn:hover:not(:disabled) {
    @apply bg-gbc-border text-gbc-yellow;
  }

  .action-btn:active:not(:disabled) {
    @apply bg-gbc-green text-gbc-dark-green;
  }

  .action-btn:disabled {
    @apply opacity-40 cursor-not-allowed;
  }

  .action-label {
    @apply text-[0.6rem] font-bold tracking-wide;
  }

  .action-sublabel {
    @apply text-[0.5rem] text-gbc-yellow mt-1 font-bold;
  }

  .action-btn:hover:not(:disabled) .action-sublabel {
    @apply text-gbc-light;
  }

  .empty-message {
    @apply text-[0.45rem] text-gbc-green/60 text-center px-2 pb-2;
  }
</style>
