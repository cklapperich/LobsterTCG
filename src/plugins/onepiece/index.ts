import type { GameState } from '../../core/types/game';
import type { CardTemplate, PlayerIndex } from '../../core/types/card';
import type { GamePlugin } from '../../core/types/game-plugin';
import type { Playmat } from '../../core/types/playmat';

// TODO: replace stubs with real implementations

export const plugin: GamePlugin = {
  getPlaymat: async (): Promise<Playmat> => { throw new Error('Not implemented'); },
  startGame: async () => { throw new Error('Not implemented'); },
  getCardName: (t) => t.name ?? 'Unknown Card',
};

export function getTemplate(_id: string): CardTemplate | undefined {
  return undefined;
}

export function executeSetup(_state: GameState, _playerIndex: PlayerIndex): void {
  // TODO
}

export function onSetupComplete(_state: GameState): void {
  // TODO
}
