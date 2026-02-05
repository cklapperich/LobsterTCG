<script lang="ts">
  import type { CounterDefinition } from '../../core';
  import CounterIcon from './CounterIcon.svelte';

  interface Props {
    counter: CounterDefinition;
    x: number;
    y: number;
  }

  let { counter, x, y }: Props = $props();
</script>

<div
  class="counter-drag-overlay"
  style="left: {x}px; top: {y}px;"
>
  <CounterIcon {counter} size="large" />
</div>

<style>
  @reference "../../app.css";

  .counter-drag-overlay {
    position: fixed;
    pointer-events: none;
    z-index: 10000;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 0.25rem 0.5rem rgba(0, 0, 0, 0.5));
  }
</style>
