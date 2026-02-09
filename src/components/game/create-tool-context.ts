import type { Action, CardTemplate, CardInstance, GameState, ActionExecutor } from '../../core';
import { ACTION_TYPES, ACTION_SOURCES } from '../../core';
import type { ToolContext } from '../../core/ai-tools';
import type { PlayerController } from './player-config';

const ACTION_DELAY_MS = 500;

export interface ToolContextDeps {
  getState: () => GameState<CardTemplate>;
  getReadableState: (playerIndex: number) => string;
  createExecutor: () => ActionExecutor;
  controllers: [PlayerController, PlayerController];
  localPlayerIndex: number;
  isLocal: (playerIndex: number) => boolean;
  formatCardForSearch?: (template: CardTemplate) => string;
  translateZoneKey: (key: string, aiPlayerIndex: number) => string;
  describeAction: (state: GameState<CardTemplate>, action: Action) => string | null;
  onPreviewCard: (card: CardInstance<CardTemplate> | null) => void;
  /** Create a deep-cloned game state snapshot for rewind checkpoints. */
  createCheckpoint: () => any;
  /** Replace game state with a previously checkpointed snapshot. */
  restoreState: (snapshot: any) => void;
}

/**
 * Create a ToolContext for the AI player with serialized execution,
 * visual feedback, and decision blocking support.
 */
export function createToolContext(
  deps: ToolContextDeps,
  options?: { isDecisionResponse?: boolean }
): { ctx: ToolContext; waitForQueue: () => Promise<void> } {
  let queue: Promise<void> = Promise.resolve();

  const state = deps.getState();
  const aiPlayer = state.activePlayer;
  const executor = deps.createExecutor();
  const ctx: ToolContext = {
    playerIndex: aiPlayer,
    isDecisionResponse: options?.isDecisionResponse,
    formatCardForSearch: deps.formatCardForSearch,
    translateZoneKey: (key) => deps.translateZoneKey(key, aiPlayer),
    getState: () => deps.getState(),
    getReadableState: () => deps.getReadableState(aiPlayer),
    createCheckpoint: () => deps.createCheckpoint(),
    restoreState: (snapshot) => deps.restoreState(snapshot),
    execute: (actionOrFactory) => {
      const result = queue.then(async () => {
        const currentState = deps.getState();
        const action = typeof actionOrFactory === 'function'
          ? actionOrFactory(currentState)
          : actionOrFactory;
        action.source = ACTION_SOURCES.AI;

        // Block AI from ending turn with cards in staging
        if (action.type === ACTION_TYPES.END_TURN) {
          const staging = currentState.zones['staging'];
          if (staging && staging.cards.length > 0) {
            const names = staging.cards.map(c => c.template.name).join(', ');
            return `Action blocked: Cannot end turn with cards in staging (${names}). Move them to the appropriate zone first.`;
          }
        }

        // Special case: coin_flip uses visual CoinFlip animation
        if (action.type === ACTION_TYPES.COIN_FLIP) {
          const results: boolean[] = [];
          for (let i = 0; i < action.count; i++) {
            const isHeads = await executor.flipCoin();
            results.push(isHeads);
          }
          action.results = results;
          executor.tryAction(action);
          const resultStr = results.map(r => r ? 'HEADS' : 'TAILS').join(', ');
          return `Coin flip results: ${resultStr}`;
        }

        // Resolve log message BEFORE action executes (card names may change post-move)
        const logMessage = deps.describeAction(currentState, action);

        const blocked = executor.tryAction(action);
        if (blocked) return `Action blocked: ${blocked}`;

        // Log the action
        if (logMessage) executor.addLog(logMessage);

        // Auto-preview card when opponent moves it to staging
        if (action.type === ACTION_TYPES.MOVE_CARD && action.toZone === 'staging') {
          const stateNow = deps.getState();
          const card = stateNow.zones['staging']?.cards.find(c => c.instanceId === action.cardInstanceId);
          if (card && card.visibility[deps.localPlayerIndex as 0 | 1] && card.template.imageUrl) {
            deps.onPreviewCard(card);
          }
        }

        // If AI created a decision targeting a local player, block until they resolve.
        if ((action.type === ACTION_TYPES.CREATE_DECISION || action.type === ACTION_TYPES.REVEAL_HAND)) {
          const stateNow = deps.getState();
          if (stateNow.pendingDecision) {
            const target = stateNow.pendingDecision.targetPlayer;
            if (deps.isLocal(target)) {
              executor.playSfx('decisionRequested');
              await deps.controllers[target].awaitDecisionResolution();
            }
          }
        }

        // Delay for visual feedback
        await new Promise(r => setTimeout(r, ACTION_DELAY_MS));
        return logMessage ?? 'OK';
      });
      queue = result.then(() => {}, () => {});
      return result;
    },
  };

  return { ctx, waitForQueue: () => queue };
}
