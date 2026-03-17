<script lang="ts">
  import type { BoardWidget } from '../../core/types/board-widget';
  import {
    startCounterDrag,
    updateCounterDragPosition,
    endCounterDrag,
  } from './counterDragState.svelte';

  interface Props {
    widget: BoardWidget;
  }

  let { widget }: Props = $props();

  // Transparent 1x1 pixel for suppressing native drag ghost
  const transparentImg = new Image();
  transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function handleDragStart(event: DragEvent, counterId: string) {
    event.dataTransfer?.setData('text/plain', `counter:${counterId}`);
    event.dataTransfer?.setDragImage(transparentImg, 0, 0);
    startCounterDrag(counterId, `widget:${widget.id}`, event.clientX, event.clientY);
  }

  function handleDrag(event: DragEvent) {
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateCounterDragPosition(event.clientX, event.clientY);
    }
  }

  function handleDragEnd() {
    endCounterDrag();
  }
</script>

<div class="board-widget">
  {#each widget.items as item (item.id)}
    {@const isDraggable = !!item.counterId && !item.disabled && !item.dimmed}
    <div
      class="widget-item"
      class:disabled={item.disabled}
      class:dimmed={item.dimmed}
      class:draggable={isDraggable}
      draggable={isDraggable ? 'true' : 'false'}
      ondragstart={isDraggable ? (e: DragEvent) => handleDragStart(e, item.counterId!) : undefined}
      ondrag={isDraggable ? handleDrag : undefined}
      ondragend={isDraggable ? handleDragEnd : undefined}
      title={item.label ?? ''}
    >
      {#if item.imageUrl}
        <img src={item.imageUrl} alt={item.label ?? ''} class="widget-item-img" draggable="false" />
      {:else}
        <div class="widget-item-empty"></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  @reference "../../app.css";

  .board-widget {
    @apply flex gap-1 items-center justify-center py-0.5;
  }

  .widget-item {
    @apply relative flex items-center justify-center;
    @apply rounded-full overflow-hidden;
    @apply transition-all;
    width: 4rem;
    height: 4rem;
  }

  .widget-item.draggable {
    @apply cursor-grab ring-2 ring-gbc-yellow/60;
  }

  .widget-item.draggable:hover {
    @apply ring-gbc-yellow;
    transform: scale(1.1);
  }

  .widget-item.draggable:active {
    @apply cursor-grabbing;
  }

  .widget-item.disabled {
    @apply opacity-30;
  }

  .widget-item.dimmed {
    @apply opacity-40;
  }

  .widget-item-img {
    @apply w-full h-full object-cover;
  }

  .widget-item-empty {
    @apply w-full h-full bg-gbc-border/30 rounded-full;
  }
</style>
