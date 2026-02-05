import type { ZoneConfig } from './zone';
import type { PlayerIndex } from './card';

// Position on the playmat grid
export interface PlaymatPosition {
  row: number;
  col: number;
  rowSpan?: number; // defaults to 1
  colSpan?: number; // defaults to 1
}

// A slot is a visual location that can hold a zone
export interface PlaymatSlot {
  id: string;
  zoneId: string; // references ZoneConfig.id
  position: PlaymatPosition;
  label?: string; // optional display label
  stackDirection?: 'none' | 'down' | 'up' | 'right' | 'fan'; // how cards stack visually
  fixedSize?: boolean; // if true, zone won't auto-expand based on card count
}

// Group related slots together (e.g., all foundations)
export interface PlaymatZoneGroup {
  id: string;
  name: string;
  slotIds: string[];
}

// Layout configuration for the playmat
export interface PlaymatLayout {
  rows: number;
  cols: number;
  slots: PlaymatSlot[];
  groups?: PlaymatZoneGroup[];
}

// Complete playmat definition
export interface Playmat {
  id: string;
  name: string;
  gameType: string;
  playerCount: 1 | 2;
  layout: PlaymatLayout;
  zones: ZoneConfig[];
  // For 2-player games, which slots belong to which player
  playerSlots?: Record<PlayerIndex, string[]>;
}
