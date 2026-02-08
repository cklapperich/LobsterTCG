import type { PlayerIndex } from '../../core';

export type PlayerRole = 'local' | 'ai' | 'remote';

export interface PlayerConfig {
  player0: PlayerRole;
  player1: PlayerRole;
}

export const DEFAULT_CONFIG: PlayerConfig = { player0: 'local', player1: 'ai' };

export function getRole(cfg: PlayerConfig, i: PlayerIndex): PlayerRole {
  return i === 0 ? cfg.player0 : cfg.player1;
}

export function isLocal(cfg: PlayerConfig, i: PlayerIndex): boolean {
  return getRole(cfg, i) === 'local';
}

export function isAI(cfg: PlayerConfig, i: PlayerIndex): boolean {
  return getRole(cfg, i) === 'ai';
}

export function localPlayerIndex(cfg: PlayerConfig): PlayerIndex {
  if (cfg.player0 === 'local') return 0;
  if (cfg.player1 === 'local') return 1;
  return 0;
}

export function opponent(i: PlayerIndex): PlayerIndex {
  return i === 0 ? 1 : 0;
}

export function playerFromZoneKey(zoneKey: string): PlayerIndex {
  return zoneKey.startsWith('player1_') ? 0 : 1;
}

export function isLocalZone(cfg: PlayerConfig, zoneKey: string): boolean {
  return isLocal(cfg, playerFromZoneKey(zoneKey));
}

export interface PlayerController {
  takeTurn(): Promise<void>;
  takeSetupTurn(): Promise<void>;
  handleDecision(): Promise<void>;
  awaitDecisionResolution(): Promise<void>;
}
