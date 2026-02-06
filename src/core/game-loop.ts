import type { CardTemplate, Action, GameState, PlayerIndex } from './types';
import type { ReadableGameState } from './readable';
import { toReadableState } from './readable';
import { executeAction, checkOpponentZone } from './engine';
import type { PluginManager } from './plugin';

export type GameEventType =
  | 'action:queued'
  | 'action:executing'
  | 'action:executed'
  | 'action:rejected'
  | 'action:blocked'
  | 'action:replaced'
  | 'auto-action:queued'
  | 'turn:ended'
  | 'turn:started';

type GameEventListener<T extends CardTemplate = CardTemplate> = (
  event: GameEventType,
  data: {
    state: GameState<T>;
    action?: Action;
    reason?: string;
    originalAction?: Action;
    autoActions?: Action[];
  }
) => void;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const DEFAULT_MAX_ITERATIONS = 1000;

export interface GameLoopOptions {
  trackHistory?: boolean;
}

export class GameLoop<T extends CardTemplate = CardTemplate> {
  private state: GameState<T>;
  private states: GameState<T>[];
  private actions: Action[];
  private queue: Action[];
  private listeners: Map<GameEventType, GameEventListener<T>[]>;
  private validator: ((state: GameState<T>, action: Action) => string | null) | null;
  private pluginManager: PluginManager<T> | null;
  private maxIterations: number;
  private trackHistory: boolean;

  constructor(state: GameState<T>, pluginManager?: PluginManager<T>, options?: GameLoopOptions) {
    this.trackHistory = options?.trackHistory ?? true;
    this.state = state;
    this.states = this.trackHistory ? [deepClone(state)] : [];
    this.actions = [];
    this.queue = [];
    this.listeners = new Map();
    this.validator = null;
    this.pluginManager = pluginManager ?? null;
    this.maxIterations = DEFAULT_MAX_ITERATIONS;
  }

  private emit(
    event: GameEventType,
    data: {
      state: GameState<T>;
      action?: Action;
      reason?: string;
      originalAction?: Action;
      autoActions?: Action[];
    }
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
    let action = this.queue.shift();
    if (!action) return;

    // Plugin blockers (run first, before validation)
    if (this.pluginManager) {
      const blockReason = this.pluginManager.validateAction(this.state, action);
      if (blockReason) {
        this.state.log.push(`Action blocked: ${blockReason}`);
        this.emit('action:blocked', { state: this.state, action, reason: blockReason });
        return;
      }
    }

    // Opponent zone check (game-universal, not plugin-specific)
    const opponentCheck = checkOpponentZone(this.state, action);
    if (opponentCheck) {
      if (opponentCheck.shouldBlock) {
        this.state.log.push(`Action blocked: ${opponentCheck.reason}`);
        this.emit('action:blocked', { state: this.state, action, reason: opponentCheck.reason });
        return;
      } else {
        this.state.log.push(`Warning: ${opponentCheck.reason}`);
      }
    }

    // Standard validation
    if (this.validator) {
      const error = this.validator(this.state, action);
      if (error) {
        this.emit('action:rejected', { state: this.state, action, reason: error });
        return;
      }
    }

    // Plugin pre-hooks
    if (this.pluginManager) {
      const preResult = this.pluginManager.runPreHooks(this.state, action);
      if (preResult.outcome === 'block') {
        this.state.log.push(`Action blocked: ${preResult.reason ?? 'Unknown reason'}`);
        this.emit('action:blocked', { state: this.state, action, reason: preResult.reason });
        return;
      }
      if (preResult.outcome === 'warn') {
        this.state.log.push(`Warning: ${preResult.reason}`);
      }
      if (preResult.outcome === 'replace') {
        const originalAction = action;
        action = preResult.action;
        this.emit('action:replaced', { state: this.state, action, originalAction });
      }
    }

    const previousTurn = this.state.turnNumber;
    const previousPlayer = this.state.activePlayer;
    const prevState = deepClone(this.state);

    this.emit('action:executing', { state: this.state, action });

    // Execute the action - check for custom executor first
    let executed = false;
    if (this.pluginManager) {
      const customExecutor = this.pluginManager.getCustomExecutor(action.type);
      if (customExecutor) {
        customExecutor(this.state, action);
        executed = true;
      }
    }
    if (!executed) {
      const blocked = executeAction(this.state, action);
      if (blocked) {
        this.emit('action:blocked', { state: this.state, action, reason: blocked });
        return;
      }
    }

    // Record history
    if (this.trackHistory) {
      this.states.push(deepClone(this.state));
      this.actions.push(action);
    }

    this.emit('action:executed', { state: this.state, action });

    // Plugin post-hooks and state observers
    if (this.pluginManager) {
      const followUpActions = this.pluginManager.runPostHooks(this.state, action, prevState);
      const autoActions = this.pluginManager.runStateObservers(this.state, prevState, action);

      const allFollowUps = [...followUpActions, ...autoActions];
      if (allFollowUps.length > 0) {
        // Queue follow-up actions at front
        this.queue.unshift(...allFollowUps);
        this.emit('auto-action:queued', { state: this.state, autoActions: allFollowUps });
      }
    }

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
    let iterations = 0;
    while (this.queue.length > 0 && iterations < this.maxIterations) {
      this.processNext();
      iterations++;
    }

    if (iterations >= this.maxIterations) {
      console.warn(
        `GameLoop.processAll() hit max iterations (${this.maxIterations}). ` +
          `Possible infinite loop from auto-actions.`
      );
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

  setMaxIterations(max: number): void {
    this.maxIterations = max;
  }

  getState(): GameState<T> {
    return this.state;
  }

  getReadableState(playerIndex: PlayerIndex): ReadableGameState {
    const readable = toReadableState(this.state, playerIndex);
    return this.pluginManager
      ? this.pluginManager.applyReadableStateModifier(readable)
      : readable;
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

  getPluginManager(): PluginManager<T> | null {
    return this.pluginManager;
  }

  notifyGameStart(): void {
    this.pluginManager?.notifyGameStart(this.state);
  }

  notifyGameEnd(): void {
    this.pluginManager?.notifyGameEnd(this.state);
  }
}
