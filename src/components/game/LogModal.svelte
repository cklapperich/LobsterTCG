<script lang="ts">
  import { playSfx } from '../../lib/audio.svelte';

  interface Props {
    logEntries: string[];
    onLogSubmit: (msg: string) => void;
  }

  let { logEntries, onLogSubmit }: Props = $props();

  let visible = $state(false);
  let logInput = $state('');
  let entriesEl = $state<HTMLDivElement | null>(null);

  export function show() {
    visible = true;
    playSfx('cursor');
  }

  function handleClose() {
    visible = false;
    playSfx('cancel');
  }

  $effect(() => {
    logEntries.length;
    if (entriesEl) entriesEl.scrollTop = entriesEl.scrollHeight;
  });
</script>

{#if visible}
  <div class="log-overlay" onclick={handleClose} onkeydown={(e) => e.key === 'Escape' && handleClose()} role="dialog" tabindex="-1">
    <div class="log-modal gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
      <div class="log-modal-header">
        <span class="text-gbc-yellow text-sm font-retro tracking-wide">GAME LOG</span>
        <button class="close-btn" onclick={handleClose}>X</button>
      </div>
      <div class="log-modal-entries" bind:this={entriesEl}>
        {#each logEntries as entry}
          <div class="log-modal-entry" class:text-gbc-yellow={entry.startsWith('Warning:')} class:text-gbc-light={!entry.startsWith('Warning:')}>{entry}</div>
        {/each}
      </div>
      <form class="log-modal-input-bar" onsubmit={(e) => {
        e.preventDefault();
        if (!logInput.trim()) return;
        onLogSubmit(logInput.trim());
        logInput = '';
      }}>
        <input
          type="text"
          class="log-modal-input"
          placeholder="Type a message..."
          bind:value={logInput}
        />
      </form>
    </div>
  </div>
{/if}

<style>
  @reference "../../app.css";

  .log-overlay {
    @apply fixed inset-0 z-[200] flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .log-modal {
    @apply flex flex-col w-[90vw] max-w-[40rem] h-[70vh] max-h-[40rem];
  }

  .log-modal-header {
    @apply flex items-center justify-between px-4 py-2 border-b border-gbc-border;
  }

  .close-btn {
    @apply text-gbc-light/60 hover:text-gbc-light bg-transparent border-none font-retro text-sm cursor-pointer;
  }

  .log-modal-entries {
    @apply flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-1;
  }

  .log-modal-entry {
    @apply text-sm leading-relaxed break-words;
  }

  .log-modal-input-bar {
    @apply px-4 py-2 border-t border-gbc-border;
  }

  .log-modal-input {
    @apply w-full bg-gbc-dark-green text-gbc-light text-sm px-3 py-2 border border-gbc-border rounded-sm;
    @apply outline-none;
  }

  .log-modal-input::placeholder {
    @apply text-gbc-green/50;
  }

  .log-modal-input:focus {
    @apply border-gbc-green;
  }
</style>
