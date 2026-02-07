<script lang="ts">
  import { onMount } from 'svelte';
  import type { ZoneConfig } from '../../core';
  import { ORIENTATIONS } from '../../core';

  interface Props {
    x: number;
    y: number;
    zoneName: string;
    cardCount: number;
    zoneConfig: ZoneConfig;
    onShuffle: () => void;
    onPeekTop: (count: number) => void;
    onClearCounters?: () => void;
    onSetOrientation?: (degrees: string) => void;
    onRevealToOpponent?: () => void;
    onRevealBothHands?: () => void;
    onMovePile?: () => void;
    onSearch?: () => void;
    onClose: () => void;
  }

  let {
    x,
    y,
    zoneName,
    cardCount,
    zoneConfig,
    onShuffle,
    onPeekTop,
    onClearCounters,
    onSetOrientation,
    onRevealToOpponent,
    onRevealBothHands,
    onMovePile,
    onSearch,
    onClose,
  }: Props = $props();

  let menuRef: HTMLDivElement;
  let activeSubmenu = $state<'rotate' | null>(null);
  let peekCount = $state(1);
  let peekInputRef = $state<HTMLInputElement | null>(null);

  function handlePeekSubmit() {
    const clamped = Math.max(1, Math.min(peekCount, cardCount));
    onPeekTop(clamped);
    onClose();
  }

  function handleClickOutside(event: MouseEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      onClose();
    }
  }

  function handleAction(action: () => void) {
    action();
    onClose();
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="context-menu gbc-panel"
  bind:this={menuRef}
  style="left: {x}px; top: {y}px;"
  oncontextmenu={(e) => e.preventDefault()}
>
  <div class="menu-header">{zoneName}</div>

  {#if cardCount > 0}
    <div class="peek-row">
      <span class="peek-label">Peek</span>
      <input
        bind:this={peekInputRef}
        type="number"
        class="peek-input"
        min="1"
        max={cardCount}
        bind:value={peekCount}
        onkeydown={(e) => { if (e.key === 'Enter') handlePeekSubmit(); }}
        onclick={(e) => e.stopPropagation()}
        onwheel={(e) => { e.preventDefault(); peekCount = Math.max(1, Math.min(peekCount + (e.deltaY < 0 ? 1 : -1), cardCount)); }}
      />
      <button class="peek-go" onclick={handlePeekSubmit}>Go</button>
    </div>
  {/if}

  {#if zoneConfig.shuffleable}
    <button class="menu-item" onclick={() => handleAction(onShuffle)} disabled={cardCount < 2}>
      Shuffle
    </button>
  {/if}

  {#if onSearch && cardCount > 0}
    <button class="menu-item" onclick={() => handleAction(onSearch)}>
      Search
    </button>
  {/if}

  {#if onMovePile}
    <button class="menu-item" onclick={() => handleAction(onMovePile)} disabled={cardCount < 1}>
      Move Pile
    </button>
  {/if}

  {#if onClearCounters}
    <button class="menu-item" onclick={() => handleAction(onClearCounters)} disabled={cardCount < 1}>
      Clear Counters
    </button>
  {/if}

  {#if onRevealToOpponent && cardCount > 0}
    <button class="menu-item" onclick={() => handleAction(onRevealToOpponent)} disabled={cardCount < 1}>
      Reveal to Opponent
    </button>
  {/if}

  {#if onRevealBothHands && cardCount > 0}
    <button class="menu-item" onclick={() => handleAction(onRevealBothHands)} disabled={cardCount < 1}>
      Reveal Both Hands
    </button>
  {/if}

  <!-- Rotate submenu wrapper -->
  {#if onSetOrientation && cardCount > 0}
    <div
      class="submenu-wrapper"
      onmouseenter={() => { activeSubmenu = 'rotate'; }}
    >
      <div class="menu-item has-submenu" class:open={activeSubmenu === 'rotate'}>
        <span>Rotate...</span>
        <span class="arrow">▶</span>
      </div>

      {#if activeSubmenu === 'rotate'}
        <div class="submenu gbc-panel">
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation(ORIENTATIONS.TAPPED))}>90°</button>
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation(ORIENTATIONS.FLIPPED))}>180°</button>
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation(ORIENTATIONS.COUNTER_TAPPED))}>270°</button>
          <div class="submenu-divider"></div>
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation(ORIENTATIONS.NORMAL))}>Reset (0°)</button>
        </div>
      {/if}
    </div>
  {/if}

</div>

<style>
  @reference "../../app.css";

  .context-menu {
    @apply fixed min-w-32;
    @apply p-1;
    z-index: 9999;
  }

  .menu-header {
    @apply text-gbc-yellow text-[0.6rem] text-center py-1 px-2 bg-gbc-border mb-1;
  }

  .menu-item {
    @apply block w-full text-left text-[0.75rem] py-2 px-3;
    @apply text-gbc-cream bg-transparent border-none cursor-pointer;
    @apply hover:bg-gbc-border hover:text-gbc-yellow;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
    transition: background 0.1s, color 0.1s;
  }

  .menu-item.has-submenu {
    @apply flex justify-between items-center;
  }

  .menu-item.has-submenu.open {
    @apply bg-gbc-border text-gbc-yellow;
  }

  .menu-item .arrow {
    @apply text-[0.6rem] ml-2;
  }

  .submenu-wrapper {
    @apply relative;
  }

  .submenu {
    @apply absolute left-full min-w-24;
    @apply p-1;
    bottom: 0;
    margin-left: 0.25rem;
    z-index: 10000;
  }

  .peek-row {
    @apply flex items-center gap-1.5 px-3 py-2;
  }

  .peek-label {
    @apply text-gbc-cream text-[0.75rem] whitespace-nowrap;
  }

  .peek-input {
    @apply w-10 bg-gbc-dark-green text-gbc-light text-[0.7rem] text-center px-1 py-0.5 border border-gbc-border rounded-sm font-retro;
    @apply outline-none;
    -moz-appearance: textfield;
  }

  .peek-input::-webkit-inner-spin-button,
  .peek-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .peek-input:focus {
    @apply border-gbc-green;
  }

  .peek-go {
    @apply text-[0.65rem] py-0.5 px-2 text-gbc-cream bg-gbc-border border-none cursor-pointer rounded-sm;
    @apply hover:bg-gbc-green hover:text-gbc-dark-green;
    transition: background 0.1s, color 0.1s;
  }
</style>
