import type { CardTemplate, Action, GameState } from './types';
import { executeAction } from './engine';

export type GameEventType =
  | 'action:queued'
  | 'action:executing'
  | 'action:executed'
  | 'action:rejected'
  | 'turn:ended'
  | 'turn:started';

type GameEventListener<T extends CardTemplate = CardTemplate> = (
  event: GameEventType,
  data: { state: GameState<T>; action?: Action; reason?: string }
) => void;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class GameLoop<T extends CardTemplate = CardTemplate> {
  private state: GameState<T>;
  private states: GameState<T>[];
  private actions: Action[];
  private queue: Action[];
  private listeners: Map<GameEventType, GameEventListener<T>[]>;
  private validator: ((state: GameState<T>, action: Action) => string | null) | null;

  constructor(state: GameState<T>) {
    this.state = state;
    this.states = [deepClone(state)];
    this.actions = [];
    this.queue = [];
    this.listeners = new Map();
    this.validator = null;
  }

  private emit(
    event: GameEventType,
    data: { state: GameState<T>; action?: Action; reason?: string }
  ): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(event, data);
    }
  }

  submit(action: Action): void {
    this.queue.push(action);
    this.emit('action:queued', { state: this.state, action });
  }

  processNext(): void {
    const action = this.queue.shift();
    if (!action) return;

    // Validate if validator is set
    if (this.validator) {
      const error = this.validator(this.state, action);
      if (error) {
        this.emit('action:rejected', { state: this.state, action, reason: error });
        return;
      }
    }

    const previousTurn = this.state.turnNumber;
    const previousPlayer = this.state.activePlayer;

    this.emit('action:executing', { state: this.state, action });

    // Execute the action
    executeAction(this.state, action);

    // Record history
    this.states.push(deepClone(this.state));
    this.actions.push(action);

    this.emit('action:executed', { state: this.state, action });

    // Check for turn change
    if (action.type === 'end_turn') {
      this.emit('turn:ended', { state: this.state, action });
      this.emit('turn:started', { state: this.state, action });
    } else if (this.state.turnNumber !== previousTurn || this.state.activePlayer !== previousPlayer) {
      this.emit('turn:ended', { state: this.state, action });
      this.emit('turn:started', { state: this.state, action });
    }
  }

  processAll(): void {
    while (this.queue.length > 0) {
      this.processNext();
    }
  }

  on(event: GameEventType, listener: GameEventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  off(event: GameEventType, listener: GameEventListener<T>): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  setValidator(fn: (state: GameState<T>, action: Action) => string | null): void {
    this.validator = fn;
  }

  getState(): GameState<T> {
    return this.state;
  }

  getHistory(): { states: GameState<T>[]; actions: Action[] } {
    return {
      states: this.states,
      actions: this.actions,
    };
  }

  getQueue(): Action[] {
    return [...this.queue];
  }

  rewind(index: number): void {
    if (index < 0 || index >= this.states.length) {
      return;
    }

    this.state = deepClone(this.states[index]);
    // Truncate history to the rewind point
    this.states = this.states.slice(0, index + 1);
    this.actions = this.actions.slice(0, index);
    // Clear pending queue
    this.queue = [];
  }
}
