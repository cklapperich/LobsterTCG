import { supabase } from './supabase';
import type { Action } from '../core/types/action';
import type { GameState } from '../core/types/game';
import type { CardTemplate } from '../core/types/card';
import type { DeckList } from '../core/types/deck';

export type P2PStatus = 'idle' | 'signaling' | 'connected' | 'error';
export type P2PRole = 'host' | 'guest';

export interface P2PState {
  status: P2PStatus;
  role: P2PRole | null;
  roomCode: string | null;
  errorMessage?: string;
}

export type P2PMessage =
  | { type: 'state_sync'; state: GameState<CardTemplate> }
  | { type: 'action'; action: Action }
  | { type: 'deck'; deck: DeckList }
  | { type: 'request_choice'; winner: 0 | 1 }
  | { type: 'choice_response'; firstPlayer: 0 | 1 };

type MessageHandler = (msg: P2PMessage) => void;

const STUN_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Wait for the Supabase channel to reach SUBSCRIBED state. */
function waitSubscribed(ch: ReturnType<typeof supabase.channel>): Promise<void> {
  return new Promise((resolve, reject) => {
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Supabase channel ${status}`));
      }
    });
  });
}

export class P2PChannel {
  state = $state<P2PState>({ status: 'idle', role: null, roomCode: null });

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private supabaseChannel: ReturnType<typeof supabase.channel> | null = null;
  private handlers: MessageHandler[] = [];
  // Buffer messages received before any handler is registered (avoids race on Game mount)
  private messageQueue: P2PMessage[] = [];
  // Buffer ICE candidates received before remote description is set
  private pendingCandidates: RTCIceCandidateInit[] = [];

  async createRoom(code: string): Promise<void> {
    this.state = { status: 'signaling', role: 'host', roomCode: code };

    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.dc = this.pc.createDataChannel('game', { ordered: true });
    this._setupDataChannel(this.dc);

    const ch = supabase.channel(`room:${code}`);
    this.supabaseChannel = ch;

    // Listen for guest's answer and ICE candidates
    ch.on('broadcast', { event: 'sdp_answer' }, async ({ payload }) => {
      if (!this.pc) return;
      await this.pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
      for (const c of this.pendingCandidates) {
        await this.pc.addIceCandidate(c).catch(() => {});
      }
      this.pendingCandidates = [];
    });

    ch.on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
      if (!this.pc || payload.from === 'host') return;
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(payload.candidate);
      } else {
        await this.pc.addIceCandidate(payload.candidate).catch(() => {});
      }
    });

    // When guest signals ready, create and send the offer
    ch.on('broadcast', { event: 'guest_ready' }, async () => {
      if (!this.pc) return;
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      ch.send({ type: 'broadcast', event: 'sdp_offer', payload: { sdp: offer } });
    });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        ch.send({
          type: 'broadcast',
          event: 'ice_candidate',
          payload: { from: 'host', candidate: candidate.toJSON() },
        });
      }
    };

    // Wait until truly subscribed before returning — host is now ready
    await waitSubscribed(ch);
  }

  async joinRoom(code: string): Promise<void> {
    this.state = { status: 'signaling', role: 'guest', roomCode: code };

    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this._setupDataChannel(this.dc);
    };

    const ch = supabase.channel(`room:${code}`);
    this.supabaseChannel = ch;

    ch.on('broadcast', { event: 'sdp_offer' }, async ({ payload }) => {
      if (!this.pc) return;
      await this.pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
      for (const c of this.pendingCandidates) {
        await this.pc.addIceCandidate(c).catch(() => {});
      }
      this.pendingCandidates = [];
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      ch.send({ type: 'broadcast', event: 'sdp_answer', payload: { sdp: answer } });
    });

    ch.on('broadcast', { event: 'ice_candidate' }, async ({ payload }) => {
      if (!this.pc || payload.from === 'guest') return;
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(payload.candidate);
      } else {
        await this.pc.addIceCandidate(payload.candidate).catch(() => {});
      }
    });

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        ch.send({
          type: 'broadcast',
          event: 'ice_candidate',
          payload: { from: 'guest', candidate: candidate.toJSON() },
        });
      }
    };

    // Wait until truly subscribed, then ping the host
    await waitSubscribed(ch);
    ch.send({ type: 'broadcast', event: 'guest_ready', payload: {} });
  }

  private _setupDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      this.state = { ...this.state, status: 'connected' };
      this.supabaseChannel?.unsubscribe();
      this.supabaseChannel = null;
    };

    dc.onclose = () => {
      if (this.state.status === 'connected') {
        this.state = { ...this.state, status: 'error', errorMessage: 'Connection lost' };
      }
    };

    dc.onerror = () => {
      this.state = { ...this.state, status: 'error', errorMessage: 'Connection error' };
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as P2PMessage;
        if (this.handlers.length === 0) {
          this.messageQueue.push(msg);
        } else {
          for (const handler of this.handlers) handler(msg);
        }
      } catch (e) {
        console.error('Failed to parse P2P message', e);
      }
    };
  }

  sendMessage(msg: P2PMessage): void {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(msg));
    } else {
      console.warn('P2P: DataChannel not open, dropping message');
    }
  }

  /** Register a message handler. Returns an unsubscribe function. Flushes any queued messages. */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    const queued = this.messageQueue.splice(0);
    for (const msg of queued) handler(msg);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  disconnect(): void {
    this.supabaseChannel?.unsubscribe();
    this.dc?.close();
    this.pc?.close();
    this.supabaseChannel = null;
    this.dc = null;
    this.pc = null;
    this.state = { status: 'idle', role: null, roomCode: null };
  }
}
