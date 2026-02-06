<script lang="ts">
  import { onMount } from 'svelte';
  import type { ZoneConfig } from '../../core';

  interface Props {
    x: number;
    y: number;
    zoneName: string;
    cardCount: number;
    zoneConfig: ZoneConfig;
    onShuffle: () => void;
    onPeekTop: (count: number) => void;
    onPeekBottom: (count: number) => void;
    onArrangeTop: (count: number) => void;
    onArrangeBottom: (count: number) => void;
    onViewAll?: () => void;
    onArrangeAll?: () => void;
    onClearCounters?: () => void;
    onSetOrientation?: (degrees: string) => void;
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
    onPeekBottom,
    onArrangeTop,
    onArrangeBottom,
    onViewAll,
    onArrangeAll,
    onClearCounters,
    onSetOrientation,
    onClose,
  }: Props = $props();

  let menuRef: HTMLDivElement;
  let activeSubmenu = $state<'peek' | 'arrange' | 'rotate' | null>(null);

  // Counts available for peek/arrange
  const availableCounts = $derived([1, 3, 5, 7].filter(n => n <= cardCount));

  // Zone visibility/ordered state for View All / Arrange All
  const isPublic = $derived(zoneConfig.defaultVisibility === 'public');
  const isOrdered = $derived(zoneConfig.ordered);

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

  {#if isPublic && onViewAll && cardCount > 0}
    <button class="menu-item" onclick={() => handleAction(onViewAll)}>
      View All ({cardCount})
    </button>
  {/if}

  {#if isPublic && isOrdered && onArrangeAll && cardCount > 1}
    <button class="menu-item" onclick={() => handleAction(onArrangeAll)}>
      Arrange All ({cardCount})
    </button>
  {/if}

  <button class="menu-item" onclick={() => handleAction(onShuffle)} disabled={cardCount < 2}>
    Shuffle
  </button>

  {#if onClearCounters}
    <button class="menu-item" onclick={() => handleAction(onClearCounters)} disabled={cardCount < 1}>
      Clear Counters
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
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation('90'))}>90°</button>
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation('180'))}>180°</button>
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation('-90'))}>270°</button>
          <div class="submenu-divider"></div>
          <button class="menu-item" onclick={() => handleAction(() => onSetOrientation('0'))}>Reset (0°)</button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Peek submenu wrapper -->
  <div
    class="submenu-wrapper"
    onmouseenter={() => { activeSubmenu = 'peek'; }}
  >
    <div class="menu-item has-submenu" class:open={activeSubmenu === 'peek'}>
      <span>Peek...</span>
      <span class="arrow">▶</span>
    </div>

    {#if activeSubmenu === 'peek' && availableCounts.length > 0}
      <div class="submenu gbc-panel">
        <div class="submenu-section">Top</div>
        {#each availableCounts as count}
          <button class="menu-item" onclick={() => handleAction(() => onPeekTop(count))}>
            {count} card{count > 1 ? 's' : ''}
          </button>
        {/each}

        <div class="submenu-divider"></div>

        <div class="submenu-section">Bottom</div>
        {#each availableCounts as count}
          <button class="menu-item" onclick={() => handleAction(() => onPeekBottom(count))}>
            {count} card{count > 1 ? 's' : ''}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Arrange submenu wrapper -->
  <div
    class="submenu-wrapper"
    onmouseenter={() => { activeSubmenu = 'arrange'; }}
  >
    <div class="menu-item has-submenu" class:open={activeSubmenu === 'arrange'}>
      <span>Arrange...</span>
      <span class="arrow">▶</span>
    </div>

    {#if activeSubmenu === 'arrange' && availableCounts.length > 0}
      <div class="submenu gbc-panel">
        <div class="submenu-section">Top</div>
        {#each availableCounts as count}
          <button class="menu-item" onclick={() => handleAction(() => onArrangeTop(count))}>
            {count} card{count > 1 ? 's' : ''}
          </button>
        {/each}

        <div class="submenu-divider"></div>

        <div class="submenu-section">Bottom</div>
        {#each availableCounts as count}
          <button class="menu-item" onclick={() => handleAction(() => onArrangeBottom(count))}>
            {count} card{count > 1 ? 's' : ''}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  @reference "../../app.css";

  .context-menu {
    @apply fixed min-w-32;
    @apply p-1;
    z-index: 9999;
  }

  .menu-header {
    @apply text-gbc-yellow text-[0.4rem] text-center py-1 px-2 bg-gbc-border mb-1;
  }

  .menu-item {
    @apply block w-full text-left text-[0.5rem] py-1.5 px-2;
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
    @apply text-[0.4rem] ml-2;
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

  .submenu-section {
    @apply text-gbc-yellow text-[0.35rem] py-0.5 px-2 uppercase tracking-wider;
  }

  .submenu-divider {
    @apply h-px bg-gbc-border my-1;
  }
</style>
