<script lang="ts">
  import type { DeckSelection } from './core/types/deck';
  import type { PlayerConfig } from './components/game/player-config';
  import type { P2PChannel } from './lib/p2p.svelte';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import Game from './components/game/Game.svelte';

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
