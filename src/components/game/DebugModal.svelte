<script lang="ts">
  let visible = $state(false);
  let narrative = $state('');
  let json = $state('');
  let tab = $state<'narrative' | 'json'>('narrative');

  export function show(n: string, j: string) {
    narrative = n;
    json = j;
    tab = 'narrative';
    visible = true;
  }

  function handleClose() { visible = false; }
</script>

{#if visible}
<div
  class="overlay"
  onclick={handleClose}
  onkeydown={(e) => e.key === 'Escape' && handleClose()}
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
    <div class="flex items-center justify-between mb-2 py-1 px-2 bg-gbc-border">
      <div class="flex items-center gap-2">
        <button
          class="gbc-btn text-[0.45rem] py-0.5 px-2"
          class:active={tab === 'narrative'}
          onclick={() => tab = 'narrative'}
        >NARRATIVE</button>
        <button
          class="gbc-btn text-[0.45rem] py-0.5 px-2"
          class:active={tab === 'json'}
          onclick={() => tab = 'json'}
        >JSON</button>
      </div>
      <button class="gbc-btn text-[0.45rem] py-0.5 px-2" onclick={handleClose}>CLOSE</button>
    </div>
    <pre class="debug-content">{tab === 'narrative' ? narrative : json}</pre>
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
    @apply max-w-4xl w-[90vw] max-h-[80vh] flex flex-col;
  }

  .debug-content {
    @apply overflow-auto px-3 py-2 text-[0.45rem] text-gbc-light font-retro leading-relaxed whitespace-pre m-0;
    scrollbar-width: thin;
    scrollbar-color: var(--color-gbc-green) var(--color-gbc-border);
  }

  :global(.gbc-btn.active) {
    @apply bg-gbc-green text-gbc-dark-green;
  }
</style>
