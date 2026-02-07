import type { ZoneConfig } from './zone';
import type { PlayerIndex } from './card';
import type { StackDirection } from './constants';

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
  stackDirection?: StackDirection; // how cards stack visually
  fixedSize?: boolean; // if true, zone won't auto-expand based on card count
  scale?: number; // Zone scale multiplier (default 1.0). 1.5 for active, 0.5 for utility
  group?: string; // Slots with same group render in a sub-grid container
  groupRow?: number; // Row within group grid (0-indexed)
  groupCol?: number; // Column within group grid (0-indexed)
  align?: 'start' | 'end' | 'center'; // Vertical alignment within grid cell (overrides row default)
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
  columnScales?: number[]; // Per-col width multipliers, e.g. [1, 1.5, 1, 1, 1, 1, 1, 0.5]
  rowHeights?: string[]; // Per-row CSS heights, e.g. ["auto", "auto", "3rem", "auto", "auto"]
}

// Complete playmat definition
export interface Playmat {
  id: string;
  name: string;
  gameType: string;
  playerCount: 1 | 2;
  layout: PlaymatLayout;
  zones: Record<string, ZoneConfig>; // zone ID -> config
  // For 2-player games, which slots belong to which player
  playerSlots?: Record<PlayerIndex, string[]>;
}
