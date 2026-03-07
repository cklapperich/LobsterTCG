export interface CounterDragState {
  counterId: string;
  source: 'tray' | string; // 'tray' or cardInstanceId
  mouseX: number;
  mouseY: number;
}

// Export the state directly so Svelte can track it reactively
export const counterDragStore = $state<{ current: CounterDragState | null }>({ current: null });

export function startCounterDrag(
  counterId: string,
  source: 'tray' | string,
  x: number,
  y: number
): void {
  counterDragStore.current = {
    counterId,
    source,
    mouseX: x,
    mouseY: y,
  };
}

export function updateCounterDragPosition(x: number, y: number): void {
  if (counterDragStore.current) {
    counterDragStore.current.mouseX = x;
    counterDragStore.current.mouseY = y;
  }
}

export function endCounterDrag(): void {
  counterDragStore.current = null;
}

