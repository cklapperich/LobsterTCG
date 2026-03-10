<script lang="ts">
  import type { DeckSelection } from '../../core/types/deck';
  import type { PlayerConfig } from '../game/player-config';
  import { P2PChannel, type P2PRole } from '../../lib/p2p.svelte';
  import { playSfx } from '../../lib/audio.svelte';

  interface ReadyParams {
    p2pChannel: P2PChannel;
    role: P2PRole;
    playerConfig: PlayerConfig;
    decks?: DeckSelection[];
  }

  interface Props {
    selectedDeck: DeckSelection;
    gameType: string;
    playmatImage: string;
    onReady: (params: ReadyParams) => void;
    onCancel: () => void;
  }

  let { selectedDeck, gameType, playmatImage, onReady, onCancel }: Props = $props();

  type Tab = 'host' | 'join';
  let tab = $state<Tab>('host');
  let roomCode = $state(generateCode());
  let joinCode = $state('');
  let channel = $state<P2PChannel | null>(null);
  let waitingForDeck = $state(false);
  let errorMsg = $state<string | null>(null);
  let deckSent = $state(false);

  function generateCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async function handleCreateGame() {
    playSfx('confirm');
    errorMsg = null;
    const ch = new P2PChannel();
    channel = ch;

    try {
      await ch.createRoom(roomCode);
    } catch (e) {
      errorMsg = 'Failed to create room. Check your connection.';
      channel = null;
      return;
    }

    // Wait for guest's deck message, then navigate
    const unsub = ch.onMessage((msg) => {
      if (msg.type === 'deck') {
        unsub();
        playSfx('confirm');
        onReady({
          p2pChannel: ch,
          role: 'host',
          playerConfig: { player0: 'local', player1: 'remote' },
          decks: [selectedDeck, { deckList: msg.deck, strategy: '' }],
        });
      }
    });
  }

  async function handleJoinGame() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    playSfx('confirm');
    errorMsg = null;
    const ch = new P2PChannel();
    channel = ch;

    try {
      await ch.joinRoom(code);
    } catch (e) {
      errorMsg = 'Failed to join room. Check the code and your connection.';
      channel = null;
      return;
    }
  }

  // When guest connects, send deck and navigate
  $effect(() => {
    if (channel?.state.status === 'connected' && channel.state.role === 'guest' && !deckSent) {
      deckSent = true;
      channel.sendMessage({ type: 'deck', deck: selectedDeck.deckList });
      playSfx('confirm');
      onReady({
        p2pChannel: channel,
        role: 'guest',
        playerConfig: { player0: 'remote', player1: 'local' },
      });
    }
  });

  // Surface connection errors
  $effect(() => {
    if (channel?.state.status === 'error') {
      errorMsg = channel.state.errorMessage ?? 'Connection failed';
    }
  });

  function handleCancel() {
    channel?.disconnect();
    channel = null;
    playSfx('cancel');
    onCancel();
  }

  let codeCopied = $state(false);

  function copyCode() {
    navigator.clipboard.writeText(roomCode).catch(() => {});
    playSfx('cursor');
    codeCopied = true;
    setTimeout(() => { codeCopied = false; }, 2000);
  }

  const statusLabel = $derived.by(() => {
    const s = channel?.state.status ?? 'idle';
    if (s === 'signaling') return tab === 'host' ? 'Waiting for opponent...' : 'Connecting...';
    if (s === 'connected') return tab === 'host' ? 'Connected — waiting for deck...' : 'Connected — sending deck...';
    return null;
  });
</script>

<div class="lobby-container font-retro bg-gbc-bg min-h-screen w-screen flex flex-col items-center justify-center p-4 box-border relative">
  <div class="scanlines"></div>

  <div class="gbc-panel-lg max-w-lg w-full relative">
    <h1 class="text-gbc-yellow text-xl text-center mb-6 tracking-wide title-shadow">
      PLAY ONLINE
    </h1>

    <!-- Deck badge -->
    <div class="mb-6 text-center">
      <span class="text-gbc-green text-[0.55rem]">YOUR DECK:</span>
      <span class="text-gbc-yellow text-[0.55rem] ml-2">{selectedDeck.deckList.name}</span>
    </div>

    {#if !channel || channel.state.status === 'error'}
      <!-- Tabs -->
      <div class="flex mb-6 gap-2">
        <button
          class="flex-1 gbc-btn text-[0.6rem] py-2 {tab === 'host' ? '' : 'opacity-50'}"
          onclick={() => { tab = 'host'; playSfx('cursor'); }}
        >
          HOST
        </button>
        <button
          class="flex-1 gbc-btn text-[0.6rem] py-2 {tab === 'join' ? '' : 'opacity-50'}"
          onclick={() => { tab = 'join'; playSfx('cursor'); }}
        >
          JOIN
        </button>
      </div>

      {#if tab === 'host'}
        <div class="flex flex-col gap-4">
          <div class="player-label text-gbc-green text-[0.55rem] mb-1">ROOM CODE</div>
          <div class="flex items-center gap-3">
            <button class="code-display flex-1 text-center text-gbc-yellow text-lg tracking-[0.5em] py-3 px-4 border-2 border-gbc-border bg-gbc-cream/10 cursor-pointer font-retro" onclick={copyCode}>
              {roomCode}
            </button>
          </div>
          <p class="text-[0.45rem] text-center {codeCopied ? 'text-gbc-yellow' : 'text-gbc-light/70'}">
            {codeCopied ? 'Code copied to clipboard!' : 'Click code to copy. Share with opponent — they enter it in JOIN tab.'}
          </p>
          <button
            class="gbc-btn text-[0.6rem] py-3 mt-2"
            onclick={handleCreateGame}
          >
            CREATE GAME
          </button>
        </div>

      {:else}
        <div class="flex flex-col gap-4">
          <div class="player-label text-gbc-green text-[0.55rem] mb-1">ENTER ROOM CODE</div>
          <input
            class="code-input text-center text-gbc-yellow text-lg tracking-[0.4em] py-3 px-4 border-2 border-gbc-border bg-gbc-cream/10 font-retro w-full uppercase"
            type="text"
            maxlength="8"
            placeholder="ABC123"
            bind:value={joinCode}
            onkeydown={(e) => e.key === 'Enter' && handleJoinGame()}
          />
          <button
            class="gbc-btn text-[0.6rem] py-3 mt-2"
            onclick={handleJoinGame}
            disabled={joinCode.trim().length < 4}
          >
            JOIN GAME
          </button>
        </div>
      {/if}

      {#if errorMsg}
        <div class="mt-4 text-gbc-red text-[0.5rem] text-center">{errorMsg}</div>
      {/if}

    {:else}
      <!-- Connecting / connected state -->
      <div class="flex flex-col items-center gap-6 py-4">
        {#if channel.state.status === 'signaling'}
          <div class="spinner"></div>
        {:else if channel.state.status === 'connected'}
          <div class="text-gbc-green text-2xl">✓</div>
        {/if}

        <div class="text-gbc-yellow text-[0.6rem] text-center">{statusLabel}</div>

        {#if channel.state.role === 'host' && channel.state.roomCode}
          <div class="text-gbc-light/60 text-[0.5rem] text-center">
            Room: <span class="text-gbc-yellow tracking-widest">{channel.state.roomCode}</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Cancel -->
    <div class="flex justify-center mt-6">
      <button class="gbc-btn text-[0.5rem] py-2 px-6 opacity-70" onclick={handleCancel}>
        CANCEL
      </button>
    </div>
  </div>

  <div class="credits text-gbc-border text-[0.4rem] mt-8 opacity-70">
    LOBSTER TCG
  </div>
</div>

<style>
  @reference "../../app.css";

  .scanlines {
    @apply absolute inset-0 pointer-events-none z-[100];
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 0.125rem,
      rgba(0, 0, 0, 0.03) 0.125rem,
      rgba(0, 0, 0, 0.03) 0.25rem
    );
  }

  .title-shadow {
    text-shadow:
      0.125rem 0.125rem 0 var(--color-gbc-red),
      0.25rem 0.25rem 0 var(--color-gbc-border);
  }

  .code-display {
    font-family: var(--font-retro, monospace);
    letter-spacing: 0.4em;
    border-color: var(--color-gbc-border);
  }

  .code-input {
    outline: none;
    font-family: var(--font-retro, monospace);
  }

  .code-input:focus {
    border-color: var(--color-gbc-yellow);
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--color-gbc-border);
    border-top-color: var(--color-gbc-yellow);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
