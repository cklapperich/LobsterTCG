import type { PokemonCardTemplate } from './cards';

// Normalize subtypes: "Stage 1" and "Stage1" both match
function hasSubtype(t: PokemonCardTemplate, ...names: string[]): boolean {
  return t.subtypes.some((s) => {
    const normalized = s.replace(/\s+/g, '').toLowerCase();
    return names.some((n) => n.replace(/\s+/g, '').toLowerCase() === normalized);
  });
}

export function isBasicPokemon(t: PokemonCardTemplate): boolean {
  return t.supertype === 'Pokemon' && hasSubtype(t, 'Basic');
}

export function isStage1(t: PokemonCardTemplate): boolean {
  return t.supertype === 'Pokemon' && hasSubtype(t, 'Stage1', 'Stage 1');
}

export function isStage2(t: PokemonCardTemplate): boolean {
  return t.supertype === 'Pokemon' && hasSubtype(t, 'Stage2', 'Stage 2');
}

export function isEvolution(t: PokemonCardTemplate): boolean {
  return isStage1(t) || isStage2(t);
}

export function isSupporter(t: PokemonCardTemplate): boolean {
  return t.supertype === 'Trainer' && hasSubtype(t, 'Supporter');
}

export function isStadium(t: PokemonCardTemplate): boolean {
  return t.supertype === 'Trainer' && hasSubtype(t, 'Stadium');
}

export function isEnergy(t: PokemonCardTemplate): boolean {
  return t.supertype === 'Energy';
}

export function isFieldZone(zoneId: string): boolean {
  return zoneId === 'active' || /^bench_\d+$/.test(zoneId);
}
