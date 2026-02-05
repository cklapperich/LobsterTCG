// Card types
export type { Visibility, PlayerIndex, CardTemplate, CardInstance } from './card';
export { VISIBILITY } from './card';

// Deck types
export type { DeckEntry, DeckList } from './deck';

// Zone types
export type { ZoneConfig, Zone } from './zone';

// Action types
export type {
  Action,
  DrawAction,
  MoveCardAction,
  PlayCardAction,
  AttachCardAction,
  PlaceOnZoneAction,
  ShuffleAction,
  SearchZoneAction,
  FlipCardAction,
  SetOrientationAction,
  AddStatusAction,
  RemoveStatusAction,
  AddCounterAction,
  RemoveCounterAction,
  SetCounterAction,
  CoinFlipAction,
  DiceRollAction,
  EndTurnAction,
  ConcedeAction,
  DeclareVictoryAction,
  RevealAction,
  PeekAction,
} from './action';

// Game types
export type {
  PlayerInfo,
  Turn,
  GameConfig,
  GameResult,
  GameState,
} from './game';

// Playmat types
export type {
  PlaymatPosition,
  PlaymatSlot,
  PlaymatZoneGroup,
  PlaymatLayout,
  Playmat,
} from './playmat';

// Game plugin interface
export type { GamePlugin } from './game-plugin';

// Counter types
export type { CounterDefinition } from './counter';
