import type { PokemonCardTemplate } from './cards';
import { SUPERTYPES, STAGES, TRAINER_SUBTYPES } from './constants';

// Normalize subtypes: "Stage 1" and "Stage1" both match
function hasSubtype(t: PokemonCardTemplate, ...names: string[]): boolean {
  return t.subtypes.some((s) => {
    const normalized = s.replace(/\s+/g, '').toLowerCase();
    return names.some((n) => n.replace(/\s+/g, '').toLowerCase() === normalized);
  });
}

export function isBasicPokemon(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, STAGES.BASIC);
}

export function isStage1(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, STAGES.STAGE_1, STAGES.STAGE_1_ALT);
}

export function isStage2(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, STAGES.STAGE_2, STAGES.STAGE_2_ALT);
}

export function isEvolution(t: PokemonCardTemplate): boolean {
  return isStage1(t) || isStage2(t);
}

export function isSupporter(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.TRAINER && hasSubtype(t, TRAINER_SUBTYPES.SUPPORTER);
}

export function isStadium(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.TRAINER && hasSubtype(t, TRAINER_SUBTYPES.STADIUM);
}

export function isEnergy(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.ENERGY;
}

export function isFieldZone(zoneKey: string): boolean {
  return zoneKey.endsWith('_active') || /_bench_\d+$/.test(zoneKey);
}

export function isStadiumZone(zoneKey: string): boolean {
  return zoneKey.endsWith('_stadium');
}
