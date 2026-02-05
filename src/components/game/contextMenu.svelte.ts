// Context menu store - manages zone context menu state
import type { ZoneConfig } from '../../core';

export interface ContextMenuState {
  zoneKey: string;
  zoneName: string;
  cardCount: number;
  zoneConfig: ZoneConfig;
  x: number;
  y: number;
}

export const contextMenuStore = $state<{ current: ContextMenuState | null }>({ current: null });

export function openContextMenu(state: ContextMenuState): void {
  contextMenuStore.current = state;
}

export function closeContextMenu(): void {
  contextMenuStore.current = null;
}
