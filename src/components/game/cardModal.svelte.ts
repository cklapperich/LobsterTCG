// Card modal store - manages peek/browse/search modal state
import type { CardInstance, CardTemplate } from '../../core';

export interface CardModalState {
  cards: CardInstance<CardTemplate>[];
  zoneKey: string;
  zoneName: string;
  allowReorder: boolean;
  shuffleOnConfirm: boolean;
  isDecision?: boolean;
}

export const cardModalStore = $state<{ current: CardModalState | null }>({ current: null });

export function openCardModal(state: CardModalState): void {
  cardModalStore.current = state;
}

export function closeCardModal(): void {
  cardModalStore.current = null;
}
