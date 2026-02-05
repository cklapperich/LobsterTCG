<script lang="ts">
  import type { DeckList } from './core';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import Game from './components/game/Game.svelte';

  type Screen = 'deck-select' | 'game';

  let currentScreen = $state<Screen>('deck-select');
  let selectedDecks = $state<{ player1: DeckList; player2: DeckList } | null>(null);

  function handleStartGame(player1Deck: DeckList, player2Deck: DeckList) {
    selectedDecks = { player1: player1Deck, player2: player2Deck };
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
    onBackToMenu={handleBackToMenu}
  />
{/if}
