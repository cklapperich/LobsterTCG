import type { CardTemplate, Action, GameState } from '../types';
import type { PluginManager } from './plugin-manager';

// Hook result types
export type PreHookResult =
  | { outcome: 'continue' }
  | { outcome: 'block'; reason: string }
  | { outcome: 'replace'; action: Action };

export type PostHookResult = { followUpActions?: Action[] };

// Hook function signatures
export type PreActionHook<T extends CardTemplate = CardTemplate> = (
  state: Readonly<GameState<T>>,
  action: Action
) => PreHookResult;

export type PostActionHook<T extends CardTemplate = CardTemplate> = (
  state: Readonly<GameState<T>>,
  action: Action,
  prevState: Readonly<GameState<T>>
) => PostHookResult;

export type StateObserver<T extends CardTemplate = CardTemplate> = (
  state: Readonly<GameState<T>>,
  prevState: Readonly<GameState<T>>,
  lastAction: Action | null
) => Action[];

export type ActionBlocker<T extends CardTemplate = CardTemplate> = (
  state: Readonly<GameState<T>>,
  action: Action
) => string | null;

// Custom action executor
export type CustomActionExecutor<
  T extends CardTemplate = CardTemplate,
  A extends Action = Action
> = (state: GameState<T>, action: A) => void;

// Hook with priority
export interface PrioritizedPreHook<T extends CardTemplate = CardTemplate> {
  hook: PreActionHook<T>;
  priority?: number;
}

export interface PrioritizedPostHook<T extends CardTemplate = CardTemplate> {
  hook: PostActionHook<T>;
  priority?: number;
}

export interface PrioritizedStateObserver<T extends CardTemplate = CardTemplate> {
  observer: StateObserver<T>;
  priority?: number;
}

export interface PrioritizedBlocker<T extends CardTemplate = CardTemplate> {
  blocker: ActionBlocker<T>;
  priority?: number;
}

export interface CustomActionRegistration<T extends CardTemplate = CardTemplate> {
  type: string;
  executor: CustomActionExecutor<T, any>;
}

// Main plugin interface
export interface Plugin<T extends CardTemplate = CardTemplate> {
  id: string;
  name: string;
  version: string;
  dependencies?: string[];

  // Lifecycle
  onRegister?(manager: PluginManager<T>): void;
  onUnregister?(manager: PluginManager<T>): void;
  onGameStart?(state: GameState<T>): void;
  onGameEnd?(state: GameState<T>): void;

  // Hooks (keyed by action type, '*' for all)
  preHooks?: Record<string, PrioritizedPreHook<T>[]>;
  postHooks?: Record<string, PrioritizedPostHook<T>[]>;

  // Auto-actions
  stateObservers?: PrioritizedStateObserver<T>[];

  // Blocking
  blockers?: PrioritizedBlocker<T>[];

  // Custom actions
  customActions?: CustomActionRegistration<T>[];
}
