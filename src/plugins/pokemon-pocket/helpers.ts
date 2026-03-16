import type { PocketCardTemplate } from './types';
import { SUPERTYPES, STAGES, TRAINER_SUBTYPES } from './constants';

function hasSubtype(t: PocketCardTemplate, ...names: string[]): boolean {
  return t.subtypes.some((s) => {
    const normalized = s.replace(/\s+/g, '').toLowerCase();
    return names.some((n) => n.replace(/\s+/g, '').toLowerCase() === normalized);
  });
}

export function isBasicPokemon(t: PocketCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, STAGES.BASIC);
}

export function isStage1(t: PocketCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, STAGES.STAGE_1);
}

export function isStage2(t: PocketCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, STAGES.STAGE_2);
}

export function isEvolution(t: PocketCardTemplate): boolean {
  return isStage1(t) || isStage2(t);
}

export function isExPokemon(t: PocketCardTemplate): boolean {
  return t.supertype === SUPERTYPES.POKEMON && hasSubtype(t, 'ex');
}

export function isSupporter(t: PocketCardTemplate): boolean {
  return t.supertype === SUPERTYPES.TRAINER && hasSubtype(t, TRAINER_SUBTYPES.SUPPORTER);
}

export function isItem(t: PocketCardTemplate): boolean {
  return t.supertype === SUPERTYPES.TRAINER && hasSubtype(t, TRAINER_SUBTYPES.ITEM);
}

export function isFieldZone(zoneKey: string): boolean {
  return zoneKey.endsWith('_active') || /_bench_\d+$/.test(zoneKey);
}
