import type { Action } from './types';
import type { PlayerIndex } from './types';

export interface ActionExecutor {
  /** Execute action through plugin hooks + state mutation + reactivity trigger. Returns error string if blocked, null on success. */
  tryAction(action: Action): string | null;
  /** Flip a coin with visual animation. Returns true=heads, false=tails. */
  flipCoin(): Promise<boolean>;
  /** Play a sound effect. */
  playSfx(key: string): void;
  /** Shuffle a zone with animation + action execution. */
  shuffleZone(playerIndex: PlayerIndex, zoneKey: string): Promise<void>;
  /** Add a log message and trigger reactivity. */
  addLog(message: string): void;
}
