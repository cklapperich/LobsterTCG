<script lang="ts">
  import type { DeckList } from './core';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import Game from './components/game/Game.svelte';

  type Screen = 'deck-select' | 'game';

  let currentScreen = $state<Screen>('deck-select');
  let selectedDecks = $state<{ player1: DeckList; player2: DeckList; lassTest: boolean; playmatImage: string } | null>(null);

  function handleStartGame(player1Deck: DeckList, player2Deck: DeckList, options: { lassTest: boolean; playmatImage: string }) {
    selectedDecks = { player1: player1Deck, player2: player2Deck, lassTest: options.lassTest, playmatImage: options.playmatImage };
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
    playmatImage={selectedDecks.playmatImage}
    onBackToMenu={handleBackToMenu}
  />
{/if}
