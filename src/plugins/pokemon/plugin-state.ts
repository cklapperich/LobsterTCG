import type { GameState } from '../../core/types';

export interface PokemonPluginState {
  gxUsed: [boolean, boolean];
  vstarUsed: [boolean, boolean];
}

const DEFAULTS: PokemonPluginState = {
  gxUsed: [false, false],
  vstarUsed: [false, false],
};

/**
 * Read-only accessor — safe to call inside $derived.
 * Returns the live pluginState reference if initialized,
 * otherwise returns frozen defaults (no mutation).
 */
export function getPluginState(state: GameState<any>): PokemonPluginState {
  const ps = state.pluginState as Partial<PokemonPluginState> | undefined;
  if (ps?.gxUsed && ps?.vstarUsed) return ps as PokemonPluginState;
  return DEFAULTS;
}

/**
 * Eagerly initialize plugin state on the GameState object.
 * Call once at game creation time (outside $derived).
 */
export function initPluginState(state: GameState<any>): void {
  if (!state.pluginState) state.pluginState = {};
  const ps = state.pluginState as Partial<PokemonPluginState>;
  if (!ps.gxUsed) ps.gxUsed = [false, false];
  if (!ps.vstarUsed) ps.vstarUsed = [false, false];
}
