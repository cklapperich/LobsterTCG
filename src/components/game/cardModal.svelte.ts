// Card modal store - manages peek/arrange modal state
import type { CardInstance, CardTemplate } from '../../core';

export interface CardModalState {
  cards: CardInstance<CardTemplate>[];
  zoneKey: string;
  zoneName: string;
  position: 'top' | 'bottom' | 'all';
  mode: 'peek' | 'arrange' | 'browse';
  isDecision?: boolean;
}

export const cardModalStore = $state<{ current: CardModalState | null }>({ current: null });

export function openCardModal(state: CardModalState): void {
  cardModalStore.current = state;
}

export function closeCardModal(): void {
  cardModalStore.current = null;
}
