<script lang="ts">
  import type { DeckSelection } from './core/types/deck';
  import type { PlayerConfig } from './components/game/player-config';
  import type { P2PChannel } from './lib/p2p.svelte';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import Game from './components/game/Game.svelte';

  const isChrome = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);
  let showBrowserWarning = $state(!isChrome);

  type Screen = 'deck-select' | 'game';

  let currentScreen = $state<Screen>('deck-select');
  let selectedGame = $state<{
    gameType: string;
    decks?: DeckSelection[];
    testFlags: Record<string, boolean>;
    playmatImage: string;
    aiModel: string;
    aiMode: string;
    plannerModel?: string;
    playerConfig: PlayerConfig;
    p2pChannel?: P2PChannel;
  } | null>(null);

  function handleStartGame(options: {
    gameType: string;
    decks?: DeckSelection[];
    testFlags: Record<string, boolean>;
    playmatImage: string;
    aiModel: string;
    aiMode: string;
    plannerModel?: string;
    playerConfig: PlayerConfig;
    p2pChannel?: P2PChannel;
  }) {
    selectedGame = options;
    currentScreen = 'game';
  }

  function handleBackToMenu() {
    currentScreen = 'deck-select';
    selectedGame = null;
  }
</script>

{#if showBrowserWarning}
  <div class="browser-warning">
    <span>This app is designed for Google Chrome. You may experience issues in other browsers.</span>
    <button onclick={() => showBrowserWarning = false}>DISMISS</button>
  </div>
{/if}

{#if currentScreen === 'deck-select'}
  <DeckSelect onStartGame={handleStartGame} />
{:else if currentScreen === 'game' && selectedGame}
  <Game
    gameType={selectedGame.gameType}
    decks={selectedGame.decks}
    testFlags={selectedGame.testFlags}
    playmatImage={selectedGame.playmatImage}
    aiModel={selectedGame.aiModel}
    aiMode={selectedGame.aiMode}
    plannerModel={selectedGame.plannerModel}
    playerConfig={selectedGame.playerConfig}
    p2pChannel={selectedGame.p2pChannel}
    onBackToMenu={handleBackToMenu}
  />
{/if}

<style>
  .browser-warning {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0.625rem 1rem;
    background: #b91c1c;
    color: #fff;
    font-family: var(--font-retro, monospace);
    font-size: 0.75rem;
    text-align: center;
  }

  .browser-warning button {
    background: transparent;
    border: 1px solid #fff;
    color: #fff;
    font-family: var(--font-retro, monospace);
    font-size: 0.625rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }

  .browser-warning button:hover {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
