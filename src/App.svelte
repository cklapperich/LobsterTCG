<script lang="ts">
  import type { DeckList } from './core';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import Game from './components/game/Game.svelte';

  type Screen = 'deck-select' | 'game';

  let currentScreen = $state<Screen>('deck-select');
  let selectedDecks = $state<{ player1: DeckList; player2: DeckList; lassTest: boolean; fastBallTest: boolean; playmatImage: string; aiModel: string } | null>(null);

  function handleStartGame(player1Deck: DeckList, player2Deck: DeckList, options: { lassTest: boolean; fastBallTest: boolean; playmatImage: string; aiModel: string }) {
    selectedDecks = { player1: player1Deck, player2: player2Deck, lassTest: options.lassTest, fastBallTest: options.fastBallTest, playmatImage: options.playmatImage, aiModel: options.aiModel };
    currentScreen = 'game';
  }

  function handleBackToMenu() {
    currentScreen = 'deck-select';
    selectedDecks = null;
  }
</script>

{#if currentScreen === 'deck-select'}
  <DeckSelect onStartGame={handleStartGame} />
{:else if currentScreen === 'game' && selectedDecks}
  <Game
    player1Deck={selectedDecks.player1}
    player2Deck={selectedDecks.player2}
    lassTest={selectedDecks.lassTest}
    fastBallTest={selectedDecks.fastBallTest}
    playmatImage={selectedDecks.playmatImage}
    aiModel={selectedDecks.aiModel}
    onBackToMenu={handleBackToMenu}
  />
{/if}
