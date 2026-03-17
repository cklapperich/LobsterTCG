import type { GameState } from '../../core/types/game';
import type { EnergyType } from './types';

export interface EnergyZoneSlot {
  current: EnergyType | null;
  next: EnergyType | null;
  attached: boolean;
}

export interface PocketPluginState {
  points: [number, number];
  energyTypePool: EnergyType[];
  energyZone: [EnergyZoneSlot, EnergyZoneSlot];
}

const DEFAULTS: PocketPluginState = {
  points: [0, 0],
  energyTypePool: [],
  energyZone: [
    { current: null, next: null, attached: false },
    { current: null, next: null, attached: false },
  ],
};

/**
 * Read-only accessor — safe to call inside $derived.
 */
export function getPluginState(state: GameState<any>): PocketPluginState {
  const ps = state.pluginState as Partial<PocketPluginState> | undefined;
  if (ps?.points && ps?.energyTypePool !== undefined && ps?.energyZone) return ps as PocketPluginState;
  return DEFAULTS;
}

/**
 * Eagerly initialize plugin state on the GameState object.
 */
export function initPluginState(state: GameState<any>, energyTypePool: EnergyType[] = []): void {
  if (!state.pluginState) state.pluginState = {};
  const ps = state.pluginState as Partial<PocketPluginState>;
  if (!ps.points) ps.points = [0, 0];
  if (!ps.energyTypePool) ps.energyTypePool = energyTypePool;
  if (!ps.energyZone) ps.energyZone = [
    { current: null, next: null, attached: false },
    { current: null, next: null, attached: false },
  ];
}

/**
 * Mulberry32 seeded RNG — produces a deterministic float in [0, 1).
 */
function seededRandom(seed: number): number {
  let s = seed >>> 0;
  s = (s + 0x6D2B79F5) >>> 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

/**
 * Roll a random energy type from the pool.
 * If seed is provided, uses deterministic RNG (for P2P sync).
 */
export function rollEnergy(pool: EnergyType[], seed?: number): EnergyType | null {
  if (pool.length === 0) return null;
  const r = seed !== undefined ? seededRandom(seed) : Math.random();
  return pool[Math.floor(r * pool.length)];
}

/**
 * Advance the energy zone for a player: next → current, generate new next.
 * Pass a seed for deterministic rolls (P2P sync).
 */
export function advanceEnergyZone(ps: PocketPluginState, playerIndex: number, seed?: number): void {
  const zone = ps.energyZone[playerIndex];
  zone.current = zone.next;
  zone.next = rollEnergy(ps.energyTypePool, seed);
  zone.attached = false;
}

/**
 * Seed a player's energy zone with an initial "next" preview (no current).
 * Used on turn 1 so both P2P peers initialize identically.
 */
export function seedEnergyZone(ps: PocketPluginState, playerIndex: number, seed: number): void {
  const zone = ps.energyZone[playerIndex];
  zone.current = null;
  zone.next = rollEnergy(ps.energyTypePool, seed);
  zone.attached = false;
}
