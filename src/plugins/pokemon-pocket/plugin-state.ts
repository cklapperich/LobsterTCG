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
 * Roll a random energy type from the pool.
 */
export function rollEnergy(pool: EnergyType[]): EnergyType | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Advance the energy zone for a player: next → current, generate new next.
 */
export function advanceEnergyZone(ps: PocketPluginState, playerIndex: number): void {
  const zone = ps.energyZone[playerIndex];
  zone.current = zone.next;
  zone.next = rollEnergy(ps.energyTypePool);
  zone.attached = false;
}
