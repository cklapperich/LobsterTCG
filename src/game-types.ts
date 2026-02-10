import type { GameTypeConfig } from './core/types/game-type-config';
import { fleshAndBloodConfig } from './plugins/fleshandblood/game-type-config';
import { onePieceConfig } from './plugins/onepiece/game-type-config';
import { pokemonConfig } from './plugins/pokemon/game-type-config';
import { solitaireConfig } from './plugins/solitaire/game-type-config';

export const GAME_TYPES: Record<string, GameTypeConfig> = {
  'pokemon-tcg': pokemonConfig,
  'klondike': solitaireConfig,
  'onepiece':onePieceConfig,
  'flesh-and-blood': fleshAndBloodConfig
};

export const DEFAULT_GAME_TYPE = 'pokemon-tcg';
