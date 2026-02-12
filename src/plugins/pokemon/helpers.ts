import type { PokemonCardTemplate, PokemonAttack, PokemonAbility } from './cards';
import { SUPERTYPES, STAGES, TRAINER_SUBTYPES, SPECIAL_SUBTYPES } from './constants';

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

export function isTool(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.TRAINER && hasSubtype(t, 'Tool');
}

export function isBreakPokemon(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, SPECIAL_SUBTYPES.BREAK);
}

export function isLegendPokemon(t: PokemonCardTemplate): boolean {
  // LEGEND cards have subtypes: ['Basic'] but "LEGEND" in the card name
  return t.supertype === SUPERTYPES.POKEMON && t.name.includes('LEGEND');
}

export function isVUnionPokemon(t: PokemonCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, SPECIAL_SUBTYPES.V_UNION);
}

export function isNaturallyLandscape(t: PokemonCardTemplate): boolean {
  return isBreakPokemon(t) || isLegendPokemon(t);
}

export function isFieldZone(zoneKey: string): boolean {
  return zoneKey.endsWith('_active') || /_bench_\d+$/.test(zoneKey);
}

export function isStadiumZone(zoneKey: string): boolean {
  return zoneKey === 'stadium';
}

// GX / VSTAR detection — parsed from effect text (no card DB schema changes)

export function isGXAttack(attack: PokemonAttack): boolean {
  return attack.effect?.includes("can't use more than 1 GX attack") ?? false;
}

export function isGXAttackByName(name: string): boolean {
  const n = name.trimEnd().toUpperCase();
  return n.endsWith(' GX') || n.endsWith('-GX');
}

export function isVSTARPower(ability: PokemonAbility): boolean {
  return ability.effect?.includes("can't use more than 1 VSTAR Power") ?? false;
}

export function isVSTARAttack(attack: PokemonAttack): boolean {
  return attack.effect?.includes("can't use more than 1 VSTAR Power") ?? false;
}
