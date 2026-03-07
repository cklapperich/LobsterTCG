<script lang="ts">
  import type { DeckSelection } from './core';
  import { DEFAULT_GAME_TYPE } from './game-types';
  import type { PlayerConfig } from './components/game/player-config';
  import type { P2PChannel } from './lib/p2p.svelte';
  import DeckSelect from './components/game/DeckSelect.svelte';
  import LobbyScreen from './components/multiplayer/LobbyScreen.svelte';
  import Game from './components/game/Game.svelte';

  type Screen = 'deck-select' | 'lobby' | 'game';

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

  // Carried from DeckSelect into Lobby
  let onlineSetup = $state<{
    deck: DeckSelection;
    gameType: string;
    playmatImage: string;
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

  function handlePlayOnline(opts: { deck: DeckSelection; gameType: string; playmatImage: string }) {
    onlineSetup = opts;
    currentScreen = 'lobby';
  }

  function handleLobbyReady(params: {
    p2pChannel: P2PChannel;
    role: 'host' | 'guest';
    playerConfig: PlayerConfig;
    decks?: DeckSelection[];
  }) {
    selectedGame = {
      gameType: onlineSetup?.gameType ?? DEFAULT_GAME_TYPE,
      decks: params.decks,
      testFlags: {},
      playmatImage: onlineSetup?.playmatImage ?? '',
      aiModel: '',
      aiMode: 'autonomous',
      playerConfig: params.playerConfig,
      p2pChannel: params.p2pChannel,
    };
    currentScreen = 'game';
  }

  function handleLobbyCancel() {
    onlineSetup = null;
    currentScreen = 'deck-select';
  }

  function handleBackToMenu() {
    currentScreen = 'deck-select';
    selectedGame = null;
    onlineSetup = null;
  }
</script>

{#if currentScreen === 'deck-select'}
  <DeckSelect onStartGame={handleStartGame} onPlayOnline={handlePlayOnline} />
{:else if currentScreen === 'lobby' && onlineSetup}
  <LobbyScreen
    selectedDeck={onlineSetup.deck}
    gameType={onlineSetup.gameType}
    playmatImage={onlineSetup.playmatImage}
    onReady={handleLobbyReady}
    onCancel={handleLobbyCancel}
  />
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
