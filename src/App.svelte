<script lang="ts">
  import type { DeckSelection } from './core';
  import { DEFAULT_GAME_TYPE } from './game-types';
  import type { PlayerConfig } from './components/game/player-config';
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
    onBackToMenu={handleBackToMenu}
  />
{/if}
