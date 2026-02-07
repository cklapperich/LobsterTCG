<script lang="ts">
  import { playSfx } from '../../lib/audio.svelte';

  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    options: Option[];
    value: string;
    onchange?: (value: string) => void;
  }

  let { options, value = $bindable(), onchange }: Props = $props();

  let open = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let listRef = $state<HTMLDivElement | null>(null);
  let focusedIndex = $state(-1);

  let selectedLabel = $derived(
    options.find(o => o.value === value)?.label ?? ''
  );

  function toggle() {
    open = !open;
    if (open) {
      focusedIndex = options.findIndex(o => o.value === value);
      playSfx('cursor');
    }
  }

  function select(opt: Option) {
    value = opt.value;
    open = false;
    focusedIndex = -1;
    playSfx('cursor');
    onchange?.(opt.value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        open = true;
        focusedIndex = options.findIndex(o => o.value === value);
        playSfx('cursor');
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, options.length - 1);
        scrollToFocused();
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        scrollToFocused();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          select(options[focusedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        open = false;
        focusedIndex = -1;
        break;
    }
  }

  function scrollToFocused() {
    if (!listRef) return;
    const items = listRef.querySelectorAll('.dropdown-item');
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      open = false;
      focusedIndex = -1;
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  });
</script>

<div class="gbc-dropdown" bind:this={dropdownRef}>
  <button
    type="button"
    class="dropdown-trigger"
    onclick={toggle}
    onkeydown={handleKeydown}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="dropdown-value">{selectedLabel}</span>
    <span class="dropdown-arrow" class:open></span>
  </button>

  {#if open}
    <div class="dropdown-list" bind:this={listRef} role="listbox">
      {#each options as opt, i}
        <button
          type="button"
          class="dropdown-item"
          class:selected={opt.value === value}
          class:focused={i === focusedIndex}
          role="option"
          aria-selected={opt.value === value}
          onclick={() => select(opt)}
          onmouseenter={() => focusedIndex = i}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  @reference "../../app.css";

  .gbc-dropdown {
    @apply relative;
  }

  .dropdown-trigger {
    @apply w-full font-retro text-[0.5rem] bg-gbc-cream text-gbc-border;
    @apply border-4 border-gbc-border p-3 pr-10 cursor-pointer;
    @apply text-left;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.1),
      0.25rem 0.25rem 0 var(--color-gbc-border);
  }

  .dropdown-trigger:focus {
    @apply outline-none bg-gbc-light;
  }

  .dropdown-arrow {
    @apply absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none;
    @apply w-0 h-0;
    border-left: 0.4rem solid transparent;
    border-right: 0.4rem solid transparent;
    border-top: 0.5rem solid var(--color-gbc-border);
    transition: transform 0.1s;
  }

  .dropdown-arrow.open {
    transform: translateY(-50%) rotate(180deg);
  }

  .dropdown-list {
    @apply absolute left-0 right-0 z-50;
    @apply bg-gbc-cream border-4 border-gbc-border;
    @apply max-h-48 overflow-y-auto;
    box-shadow:
      inset 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.05),
      0.25rem 0.25rem 0 var(--color-gbc-border);
    top: calc(100% - 0.25rem);
  }

  .dropdown-item {
    @apply w-full font-retro text-[0.5rem] text-gbc-border;
    @apply px-3 py-2.5 text-left cursor-pointer;
    @apply border-b-2 border-gbc-border/20;
    background: transparent;
    border-left: none;
    border-right: none;
    border-top: none;
  }

  .dropdown-item:last-child {
    @apply border-b-0;
  }

  .dropdown-item.focused {
    @apply bg-gbc-light;
  }

  .dropdown-item.selected {
    @apply bg-gbc-green text-gbc-cream;
  }

  .dropdown-item.selected.focused {
    @apply bg-gbc-green text-gbc-cream;
    filter: brightness(1.1);
  }

  /* Scrollbar styling */
  .dropdown-list::-webkit-scrollbar {
    width: 0.5rem;
  }

  .dropdown-list::-webkit-scrollbar-track {
    @apply bg-gbc-cream;
  }

  .dropdown-list::-webkit-scrollbar-thumb {
    @apply bg-gbc-border;
  }
</style>
