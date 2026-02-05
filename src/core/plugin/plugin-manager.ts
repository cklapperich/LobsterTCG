import type { CardTemplate, Action, GameState } from '../types';
import type { ReadableGameState } from '../readable';
import type {
  Plugin,
  PreHookResult,
  PreActionHook,
  PostActionHook,
  StateObserver,
  ActionBlocker,
  CustomActionExecutor,
  PrioritizedPreHook,
  PrioritizedPostHook,
} from './types';

interface AggregatedHook<T> {
  pluginId: string;
  hook: T;
  priority: number;
}

export class PluginManager<T extends CardTemplate = CardTemplate> {
  private plugins: Map<string, Plugin<T>> = new Map();
  private customExecutors: Map<string, CustomActionExecutor<T, any>> = new Map();

  // Aggregated hooks sorted by priority
  private preHooks: Map<string, AggregatedHook<PreActionHook<T>>[]> = new Map();
  private postHooks: Map<string, AggregatedHook<PostActionHook<T>>[]> = new Map();
  private stateObservers: AggregatedHook<StateObserver<T>>[] = [];
  private blockers: AggregatedHook<ActionBlocker<T>>[] = [];
  private readableStateModifier: ((readable: ReadableGameState) => ReadableGameState) | null = null;

  register(plugin: Plugin<T>): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`);
    }

    // Check dependencies
    if (plugin.dependencies) {
      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          throw new Error(
            `Plugin "${plugin.id}" depends on "${depId}" which is not registered`
          );
        }
      }
    }

    this.plugins.set(plugin.id, plugin);

    // Register custom actions
    if (plugin.customActions) {
      for (const { type, executor } of plugin.customActions) {
        if (this.customExecutors.has(type)) {
          throw new Error(
            `Custom action type "${type}" is already registered`
          );
        }
        this.customExecutors.set(type, executor);
      }
    }

    // Aggregate hooks
    this.aggregateHooks();

    // Call lifecycle hook
    plugin.onRegister?.(this);
  }

  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" is not registered`);
    }

    // Check if other plugins depend on this one
    for (const [id, p] of this.plugins) {
      if (p.dependencies?.includes(pluginId)) {
        throw new Error(
          `Cannot unregister "${pluginId}": plugin "${id}" depends on it`
        );
      }
    }

    // Call lifecycle hook before removal
    plugin.onUnregister?.(this);

    // Remove custom actions
    if (plugin.customActions) {
      for (const { type } of plugin.customActions) {
        this.customExecutors.delete(type);
      }
    }

    this.plugins.delete(pluginId);

    // Re-aggregate hooks
    this.aggregateHooks();
  }

  private aggregateHooks(): void {
    this.preHooks.clear();
    this.postHooks.clear();
    this.stateObservers = [];
    this.blockers = [];
    this.readableStateModifier = null;

    for (const [pluginId, plugin] of this.plugins) {
      // Aggregate pre-hooks
      if (plugin.preHooks) {
        for (const [actionType, hooks] of Object.entries(plugin.preHooks)) {
          this.addPreHooks(pluginId, actionType, hooks);
        }
      }

      // Aggregate post-hooks
      if (plugin.postHooks) {
        for (const [actionType, hooks] of Object.entries(plugin.postHooks)) {
          this.addPostHooks(pluginId, actionType, hooks);
        }
      }

      // Aggregate state observers
      if (plugin.stateObservers) {
        for (const { observer, priority = 100 } of plugin.stateObservers) {
          this.stateObservers.push({ pluginId, hook: observer, priority });
        }
      }

      // Aggregate blockers
      if (plugin.blockers) {
        for (const { blocker, priority = 100 } of plugin.blockers) {
          this.blockers.push({ pluginId, hook: blocker, priority });
        }
      }

      // Use the last registered readable state modifier
      if (plugin.readableStateModifier) {
        this.readableStateModifier = plugin.readableStateModifier;
      }
    }

    // Sort all by priority (lower = first)
    this.sortByPriority(this.stateObservers);
    this.sortByPriority(this.blockers);
    for (const hooks of this.preHooks.values()) {
      this.sortByPriority(hooks);
    }
    for (const hooks of this.postHooks.values()) {
      this.sortByPriority(hooks);
    }
  }

  private addPreHooks(
    pluginId: string,
    actionType: string,
    hooks: PrioritizedPreHook<T>[]
  ): void {
    if (!this.preHooks.has(actionType)) {
      this.preHooks.set(actionType, []);
    }
    const list = this.preHooks.get(actionType)!;
    for (const { hook, priority = 100 } of hooks) {
      list.push({ pluginId, hook, priority });
    }
  }

  private addPostHooks(
    pluginId: string,
    actionType: string,
    hooks: PrioritizedPostHook<T>[]
  ): void {
    if (!this.postHooks.has(actionType)) {
      this.postHooks.set(actionType, []);
    }
    const list = this.postHooks.get(actionType)!;
    for (const { hook, priority = 100 } of hooks) {
      list.push({ pluginId, hook, priority });
    }
  }

  private sortByPriority<H>(hooks: AggregatedHook<H>[]): void {
    hooks.sort((a, b) => a.priority - b.priority);
  }

  private getPreHooksForAction(actionType: string): AggregatedHook<PreActionHook<T>>[] {
    const specific = this.preHooks.get(actionType) ?? [];
    const wildcard = this.preHooks.get('*') ?? [];
    // Merge and sort
    const merged = [...specific, ...wildcard];
    this.sortByPriority(merged);
    return merged;
  }

  private getPostHooksForAction(actionType: string): AggregatedHook<PostActionHook<T>>[] {
    const specific = this.postHooks.get(actionType) ?? [];
    const wildcard = this.postHooks.get('*') ?? [];
    // Merge and sort
    const merged = [...specific, ...wildcard];
    this.sortByPriority(merged);
    return merged;
  }

  runPreHooks(state: Readonly<GameState<T>>, action: Action): PreHookResult {
    const hooks = this.getPreHooksForAction(action.type);
    let firstWarn: PreHookResult | null = null;

    for (const { hook } of hooks) {
      const result = hook(state, action);
      if (result.outcome === 'block' || result.outcome === 'replace') {
        return result;
      }
      if (result.outcome === 'warn' && !firstWarn) {
        firstWarn = result;
      }
    }

    return firstWarn ?? { outcome: 'continue' };
  }

  runPostHooks(
    state: Readonly<GameState<T>>,
    action: Action,
    prevState: Readonly<GameState<T>>
  ): Action[] {
    const hooks = this.getPostHooksForAction(action.type);
    const followUpActions: Action[] = [];

    for (const { hook } of hooks) {
      const result = hook(state, action, prevState);
      if (result.followUpActions) {
        followUpActions.push(...result.followUpActions);
      }
    }

    return followUpActions;
  }

  runStateObservers(
    state: Readonly<GameState<T>>,
    prevState: Readonly<GameState<T>>,
    lastAction: Action | null
  ): Action[] {
    const autoActions: Action[] = [];

    for (const { hook } of this.stateObservers) {
      const actions = hook(state, prevState, lastAction);
      autoActions.push(...actions);
    }

    return autoActions;
  }

  validateAction(state: Readonly<GameState<T>>, action: Action): string | null {
    for (const { hook } of this.blockers) {
      const reason = hook(state, action);
      if (reason !== null) {
        return reason;
      }
    }

    return null;
  }

  applyReadableStateModifier(readable: ReadableGameState): ReadableGameState {
    return this.readableStateModifier ? this.readableStateModifier(readable) : readable;
  }

  getCustomExecutor(actionType: string): CustomActionExecutor<T, any> | undefined {
    return this.customExecutors.get(actionType);
  }

  notifyGameStart(state: GameState<T>): void {
    for (const plugin of this.plugins.values()) {
      plugin.onGameStart?.(state);
    }
  }

  notifyGameEnd(state: GameState<T>): void {
    for (const plugin of this.plugins.values()) {
      plugin.onGameEnd?.(state);
    }
  }

  getPlugin(pluginId: string): Plugin<T> | undefined {
    return this.plugins.get(pluginId);
  }

  getPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
}
