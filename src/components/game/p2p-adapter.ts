import type { P2PChannel } from '../../lib/p2p.svelte';
import type { Action } from '../../core/types/action';
import type { GameState } from '../../core/types/game';
import type { CardTemplate } from '../../core/types/card';
import { ACTION_TYPES } from '../../core/types/constants';
import { shuffle } from '../../core/action';

export interface P2PAdapterCallbacks {
  tryAction: (action: Action) => string | null;
  getCoinFlipRef: () => { flip(isHeads: boolean): Promise<void> } | null;
  setGameState: (state: GameState<CardTemplate>) => void;
  showChoiceUI: (winner: 0 | 1, onChoice: (fp: 0 | 1) => void) => void;
}

export class P2PAdapter {
  private executingRemoteAction = false;
  private suppressCoinFlipAnimation = false;
  private p2pChoiceResolve: ((p: 0 | 1) => void) | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private channel: P2PChannel | undefined,
    private callbacks: P2PAdapterCallbacks,
  ) {}

  get isConnected(): boolean {
    return this.channel?.state.status === 'connected';
  }

  get isRemoteAction(): boolean {
    return this.executingRemoteAction;
  }

  get role(): 'host' | 'guest' | null {
    return this.channel?.state.role ?? null;
  }

  /** Inject deterministic seed into shuffle actions for P2P sync. */
  prepareAction(action: Action): Action {
    if (!this.channel || this.executingRemoteAction) return action;
    if (action.type === ACTION_TYPES.SHUFFLE && action.seed === undefined) {
      return { ...action, seed: (Math.random() * 0xFFFFFFFF) >>> 0 };
    }
    return action;
  }

  /** Broadcast a local action to the remote peer. No-op if not connected or executing remote. */
  broadcastAction(action: Action): void {
    if (this.isConnected && !this.executingRemoteAction) {
      this.channel!.sendMessage({ type: 'action', action });
    }
  }

  /** Broadcast coin flip result so peer animates simultaneously. */
  broadcastCoinFlip(isHeads: boolean): void {
    if (this.isConnected) {
      this.channel!.sendMessage({ type: 'coin_flip_broadcast', isHeads });
    }
  }

  /** Create a seeded shuffle action for P2P determinism. */
  createSeededShuffle(player: number, zoneKey: string): Action {
    if (this.isConnected) {
      return { ...shuffle(player as 0 | 1, zoneKey), seed: (Math.random() * 0xFFFFFFFF) >>> 0 };
    }
    return shuffle(player as 0 | 1, zoneKey);
  }

  /** Request remote player's choice (they won the coin flip). Returns their pick. */
  requestRemoteChoice(winner: 0 | 1): Promise<0 | 1> {
    this.channel?.sendMessage({ type: 'request_choice', winner });
    return new Promise<0 | 1>((resolve) => { this.p2pChoiceResolve = resolve; });
  }

  /** Subscribe to incoming P2P messages. Call after mount. */
  subscribe(): void {
    if (!this.channel) return;
    this.unsubscribe = this.channel.onMessage(async (msg) => {
      if (msg.type === 'coin_flip_broadcast') {
        this.suppressCoinFlipAnimation = true;
        await this.callbacks.getCoinFlipRef()?.flip(msg.isHeads);
      } else if (msg.type === 'action') {
        if (msg.action.type === ACTION_TYPES.COIN_FLIP) {
          if (!this.suppressCoinFlipAnimation) {
            await this.callbacks.getCoinFlipRef()?.flip(msg.action.results?.[0] ?? false);
          }
          this.suppressCoinFlipAnimation = false;
        }
        this.executingRemoteAction = true;
        this.callbacks.tryAction(msg.action);
        this.executingRemoteAction = false;
      } else if (msg.type === 'request_choice') {
        this.callbacks.showChoiceUI(msg.winner, (fp: 0 | 1) => {
          this.channel?.sendMessage({ type: 'choice_response', firstPlayer: fp });
        });
      } else if (msg.type === 'choice_response') {
        this.p2pChoiceResolve?.(msg.firstPlayer);
        this.p2pChoiceResolve = null;
      }
      // state_sync handled separately during mount; ignore here
    });
  }

  /** Guest: wait for host's state_sync message. Returns the game state. */
  waitForStateSync(): Promise<GameState<CardTemplate>> {
    return new Promise((resolve) => {
      if (!this.channel) return;
      const unsub = this.channel.onMessage((msg) => {
        if (msg.type === 'state_sync') {
          unsub();
          resolve(msg.state as GameState<CardTemplate>);
        } else if (msg.type === 'action') {
          // Actions may arrive before state_sync (shouldn't happen, but be safe)
          this.executingRemoteAction = true;
          this.callbacks.tryAction(msg.action);
          this.executingRemoteAction = false;
        }
      });
      // Store unsub so destroy() can clean up if needed
      this.unsubscribe = unsub;
    });
  }

  /** Host: send full initial state to the guest. */
  sendStateSync(state: GameState<CardTemplate>): void {
    if (!this.isConnected) return;
    this.channel!.sendMessage({ type: 'state_sync', state });
  }

  /** Clean up subscriptions. */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
