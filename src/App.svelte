<script lang="ts">
  import type { DeckList } from './core';
  import { DEFAULT_GAME_TYPE } from './game-types';
  import type { PlayerConfig } from './components/game/player-config';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import Game from './components/game/Game.svelte';

  type Screen = 'deck-select' | 'game';

  let currentScreen = $state<Screen>('deck-select');
  let selectedGame = $state<{
    gameType: string;
    player1Deck?: DeckList;
    player2Deck?: DeckList;
    testFlags: Record<string, boolean>;
    playmatImage: string;
    aiModel: string;
    aiMode: string;
    playerConfig: PlayerConfig;
  } | null>(null);

  function handleStartGame(options: {
    gameType: string;
    player1Deck?: DeckList;
    player2Deck?: DeckList;
    testFlags: Record<string, boolean>;
    playmatImage: string;
    aiModel: string;
    aiMode: string;
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
    player1Deck={selectedGame.player1Deck}
    player2Deck={selectedGame.player2Deck}
    testFlags={selectedGame.testFlags}
    playmatImage={selectedGame.playmatImage}
    aiModel={selectedGame.aiModel}
    aiMode={selectedGame.aiMode}
    playerConfig={selectedGame.playerConfig}
    onBackToMenu={handleBackToMenu}
  />
{/if}
