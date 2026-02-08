import type { GameTypeConfig } from './core/types/game-type-config';
import { pokemonConfig } from './plugins/pokemon/game-type-config';
import { solitaireConfig } from './plugins/solitaire/game-type-config';

export const GAME_TYPES: Record<string, GameTypeConfig> = {
  'pokemon-tcg': pokemonConfig,
  'klondike': solitaireConfig,
};

export const DEFAULT_GAME_TYPE = 'pokemon-tcg';
