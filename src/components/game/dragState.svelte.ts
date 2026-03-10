import type { CardInstance, CardTemplate, Visibility } from '../../core/types/card';

export interface DragState {
  cardInstanceId: string;
  fromZoneKey: string;
  originalVisibility: Visibility;
  card: CardInstance<CardTemplate>;
  mouseX: number;
  mouseY: number;
  pileCardIds?: string[];
}

// Export the state directly so Svelte can track it reactively
export const dragStore = $state<{ current: DragState | null }>({ current: null });

export function startDrag(
  card: CardInstance<CardTemplate>,
  fromZoneKey: string,
  x: number,
  y: number
): void {
  dragStore.current = {
    cardInstanceId: card.instanceId,
    fromZoneKey,
    originalVisibility: [...card.visibility] as Visibility,
    card,
    mouseX: x,
    mouseY: y
  };
}

export function startPileDrag(
  cards: CardInstance<CardTemplate>[],
  fromZoneKey: string,
  x: number,
  y: number
): void {
  if (cards.length === 0) return;
  const topCard = cards[cards.length - 1];
  dragStore.current = {
    cardInstanceId: topCard.instanceId,
    fromZoneKey,
    originalVisibility: [...topCard.visibility] as Visibility,
    card: topCard,
    mouseX: x,
    mouseY: y,
    pileCardIds: cards.map(c => c.instanceId),
  };
}

export function updateDragPosition(x: number, y: number): void {
  if (dragStore.current) {
    dragStore.current.mouseX = x;
    dragStore.current.mouseY = y;
  }
}

export function endDrag(): void {
  dragStore.current = null;
}
