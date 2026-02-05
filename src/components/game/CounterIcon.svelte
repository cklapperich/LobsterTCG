<script lang="ts">
  import type { CounterDefinition } from '../../core';

  interface Props {
    counter: CounterDefinition;
    quantity?: number;
    size?: 'small' | 'medium' | 'large';
    showQuantity?: boolean;
  }

  let {
    counter,
    quantity = 1,
    size = 'medium',
    showQuantity = false,
  }: Props = $props();

  const sizeClasses = $derived({
    small: 'w-10 h-10 text-[0.5rem]',
    medium: 'w-16 h-16 text-[0.7rem]',
    large: 'w-24 h-24 text-[0.9rem]',
  }[size]);

  const badgeClasses = $derived({
    small: 'text-[0.4rem] min-w-4 h-4 -top-1 -right-1',
    medium: 'text-[0.5rem] min-w-5 h-5 -top-1 -right-1',
    large: 'text-[0.6rem] min-w-6 h-6 -top-2 -right-2',
  }[size]);
</script>

<div class="counter-icon {sizeClasses}" title={counter.name}>
  {#if counter.imageUrl}
    <img src={counter.imageUrl} alt={counter.name} class="counter-image" />
  {:else}
    <div class="counter-fallback">
      <span>{counter.id}</span>
    </div>
  {/if}
  {#if showQuantity && quantity > 1}
    <div class="quantity-badge {badgeClasses}">
      {quantity}
    </div>
  {/if}
</div>

<style>
  @reference "../../app.css";

  .counter-icon {
    @apply relative flex items-center justify-center rounded-full;
    @apply shrink-0;
  }

  .counter-image {
    @apply w-full h-full rounded-full object-cover;
  }

  .counter-fallback {
    @apply w-full h-full flex items-center justify-center;
    @apply font-retro font-bold text-gbc-border;
  }

  .quantity-badge {
    @apply absolute flex items-center justify-center;
    @apply rounded-full bg-gbc-red text-gbc-cream font-retro font-bold;
    @apply px-0.5;
  }
</style>
