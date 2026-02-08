<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckList } from '../../core';
  import { parsePTCGODeck } from '../../plugins/pokemon/cards';
  import { playSfx } from '../../lib/audio.svelte';
  import { MODEL_OPTIONS } from '../../ai';
  import { DEFAULT_CONFIG, type PlayerConfig } from './player-config';
  import GbcDropdown from './GbcDropdown.svelte';
  import { GAME_TYPES, DEFAULT_GAME_TYPE } from '../../game-types';

  interface DeckOption {
    id: string;
    name: string;
    deckList: DeckList;
    cardCount: number;
  }

  interface PlaymatOption {
    id: string;
    name: string;
    url: string;
  }

  interface Props {
    onStartGame: (options: {
      gameType: string;
      player1Deck?: DeckList;
      player2Deck?: DeckList;
      testFlags: Record<string, boolean>;
      playmatImage: string;
      aiModel: string;
      aiMode: string;
      playerConfig: PlayerConfig;
    }) => void;
  }

  let { onStartGame }: Props = $props();

  let gameType = $state<string>(DEFAULT_GAME_TYPE);
  let loading = $state(true);
  let deckOptions = $state<DeckOption[]>([]);
  let player1Deck = $state<string>('7-19 torrential-cannon');
  let player2Deck = $state<string>('7-18 relentless-flame');
  let testFlags = $state<Record<string, boolean>>({});
  let playmatImage = $state<string>('');
  let aiModel = $state<string>('kimi-k2p5');
  let aiMode = $state<string>('autonomous');

  const gameConfig = $derived(GAME_TYPES[gameType]);

  const gameTypeOptions = Object.values(GAME_TYPES).map(g => ({
    value: g.id,
    label: g.name,
  }));

  // Discover playmat images from src/assets/playmat-images/
  const playmatModules = import.meta.glob('/src/assets/playmat-images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
  const playmatOptions: PlaymatOption[] = Object.entries(playmatModules).map(([path, url]) => {
    const filename = path.split('/').pop()?.replace('.png', '') ?? 'Unknown';
    const name = filename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { id: filename, name, url };
  });

  onMount(async () => {
    await loadDecks();
  });

  async function loadDecks() {
    if (!gameConfig?.needsDeckSelection) {
      loading = false;
      return;
    }

    // Load deck files using Vite's glob import
    const deckModules = import.meta.glob('/src/plugins/pokemon/decks/*.txt', {
      query: '?raw',
      import: 'default',
    });

    const options: DeckOption[] = [];

    // Load each deck file
    for (const [path, loader] of Object.entries(deckModules)) {
      try {
        const content = (await loader()) as string;
        const filename = path.split('/').pop()?.replace('.txt', '') ?? 'Unknown';
        const displayName = filename.charAt(0).toUpperCase() + filename.slice(1);

        const { deckList, warnings } = parsePTCGODeck(content, displayName);
        const cardCount = deckList.cards.reduce((sum, c) => sum + c.count, 0);

        if (warnings.length > 0) {
          console.warn(`Warnings parsing ${filename}:`, warnings);
        }

        options.push({
          id: filename,
          name: displayName,
          deckList,
          cardCount,
        });
      } catch (e) {
        console.error(`Failed to load deck from ${path}:`, e);
      }
    }

    deckOptions = options;
    if (!player1Deck || !options.find(d => d.id === player1Deck)) {
      player1Deck = options[0]?.id ?? '';
    }
    if (!player2Deck || !options.find(d => d.id === player2Deck)) {
      player2Deck = options[0]?.id ?? '';
    }
    loading = false;
  }

  // Re-load decks when game type changes
  $effect(() => {
    // Access gameType to make this effect reactive
    const _type = gameType;
    loading = true;
    deckOptions = [];
    testFlags = {};
    loadDecks();
  });

  function handleStartGame() {
    if (!gameConfig) return;

    if (gameConfig.needsDeckSelection) {
      const deck1 = deckOptions.find((d) => d.id === player1Deck);
      const deck2 = deckOptions.find((d) => d.id === player2Deck);
      if (!deck1 || !deck2) return;

      playSfx('confirm');
      const selectedPlaymat = playmatOptions.find(p => p.id === playmatImage);
      onStartGame({
        gameType,
        player1Deck: deck1.deckList,
        player2Deck: deck2.deckList,
        testFlags,
        playmatImage: selectedPlaymat?.url ?? '',
        aiModel,
        aiMode,
        playerConfig: DEFAULT_CONFIG,
      });
    } else {
      playSfx('confirm');
      const selectedPlaymat = playmatOptions.find(p => p.id === playmatImage);
      onStartGame({
        gameType,
        testFlags: {},
        playmatImage: selectedPlaymat?.url ?? '',
        aiModel,
        aiMode,
        playerConfig: DEFAULT_CONFIG,
      });
    }
  }

  function handleCheckboxChange() {
    playSfx('cursor');
  }

  const canStart = $derived(
    gameConfig && (!gameConfig.needsDeckSelection || (player1Deck && player2Deck))
  );
</script>

<div class="deck-select-container font-retro bg-gbc-bg min-h-screen w-screen flex flex-col items-center justify-center p-4 box-border relative">
  <div class="scanlines"></div>

  <div class="gbc-panel-lg max-w-2xl w-full">
    <h1 class="text-gbc-yellow text-xl text-center mb-8 tracking-wide title-shadow">
      {gameConfig?.name ?? 'LOBSTER TCG'}
    </h1>

    <!-- Game Type Selection -->
    <div class="game-type-select mb-6">
      <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
        <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">GAME</span>
        GAME TYPE
      </div>
      <GbcDropdown
        options={gameTypeOptions}
        bind:value={gameType}
      />
    </div>

    {#if loading}
      <div class="text-gbc-yellow text-[0.6rem] text-center py-8">
        LOADING...
      </div>
    {:else}
      {#if gameConfig?.needsDeckSelection}
        <div class="deck-selectors flex flex-col gap-8 mb-8">
          <!-- Player 1 Deck Selection -->
          <div class="player-select">
            <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
              <span class="player-badge bg-gbc-red text-gbc-cream px-2 py-1">P1</span>
              PLAYER 1 DECK
            </div>
            <GbcDropdown
              options={deckOptions.map(d => ({ value: d.id, label: `${d.name} (${d.cardCount} cards)` }))}
              bind:value={player1Deck}
            />
          </div>

          <!-- Player 2 Deck Selection -->
          <div class="player-select">
            <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
              <span class="player-badge bg-gbc-blue text-gbc-cream px-2 py-1">P2</span>
              PLAYER 2 DECK
            </div>
            <GbcDropdown
              options={deckOptions.map(d => ({ value: d.id, label: `${d.name} (${d.cardCount} cards)` }))}
              bind:value={player2Deck}
            />
          </div>
        </div>
      {/if}

      <!-- Playmat Selection -->
      {#if playmatOptions.length > 0 && gameConfig?.needsDeckSelection}
        <div class="playmat-select mb-4">
          <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
            <span class="player-badge bg-gbc-green text-gbc-cream px-2 py-1">MAT</span>
            PLAYMAT
          </div>
          <GbcDropdown
            options={[{ value: '', label: 'None' }, ...playmatOptions.map(m => ({ value: m.id, label: m.name }))]}
            bind:value={playmatImage}
          />
        </div>
      {/if}

      {#if gameConfig?.needsAIModel}
        <!-- AI Model Selection -->
        <div class="model-select mb-4">
          <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
            <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">AI</span>
            AI MODEL
          </div>
          <GbcDropdown
            options={MODEL_OPTIONS.map(m => ({ value: m.id, label: m.label }))}
            bind:value={aiModel}
          />
        </div>

        <!-- AI Mode Selection -->
        <div class="mode-select mb-4">
          <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
            <span class="player-badge bg-gbc-red text-gbc-cream px-2 py-1">MODE</span>
            AI MODE
          </div>
          <GbcDropdown
            options={[
              { value: 'pipeline', label: 'Pipeline (Plan+Execute)' },
              { value: 'autonomous', label: 'Autonomous (Single Agent)' },
            ]}
            bind:value={aiMode}
          />
        </div>
      {/if}

      {#if gameConfig?.testOptions && gameConfig.testOptions.length > 0}
        <div class="test-options flex justify-center gap-4 mb-4">
          {#each gameConfig.testOptions as opt}
            <label class="gbc-checkbox flex items-center gap-2 cursor-pointer text-gbc-green text-[0.5rem]">
              <input type="checkbox" checked={testFlags[opt.id] ?? false} onchange={() => { testFlags[opt.id] = !testFlags[opt.id]; handleCheckboxChange(); }} />
              <span>{opt.label}</span>
            </label>
          {/each}
        </div>
      {/if}

      <div class="flex justify-center">
        <button
          class="gbc-btn text-sm py-3 px-8 start-btn"
          onclick={handleStartGame}
          disabled={!canStart}
        >
          START GAME
        </button>
      </div>
    {/if}
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

  .player-badge {
    @apply font-retro text-[0.5rem] tracking-wide;
    box-shadow: 0.125rem 0.125rem 0 var(--color-gbc-border);
  }

  .gbc-checkbox input[type="checkbox"] {
    @apply appearance-none w-4 h-4 border-2 border-gbc-border bg-gbc-cream cursor-pointer;
  }

  .gbc-checkbox input[type="checkbox"]:checked {
    @apply bg-gbc-green;
    box-shadow: inset 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.2);
  }

  .start-btn {
    @apply tracking-wider;
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .start-btn:hover:not(:disabled) {
    animation: none;
  }

  @keyframes pulse-glow {
    0%, 100% {
      box-shadow:
        inset 0.125rem 0.125rem 0 rgba(255,255,255,0.3),
        inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2),
        0.25rem 0.25rem 0 var(--color-gbc-border);
    }
    50% {
      box-shadow:
        inset 0.125rem 0.125rem 0 rgba(255,255,255,0.3),
        inset -0.125rem -0.125rem 0 rgba(0,0,0,0.2),
        0.25rem 0.25rem 0 var(--color-gbc-border),
        0 0 1rem var(--color-gbc-yellow);
    }
  }
</style>
