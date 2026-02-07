<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckList } from '../../core';
  import { parsePTCGODeck } from '../../plugins/pokemon/cards';
  import { playSfx } from '../../lib/audio.svelte';
  import { MODEL_OPTIONS } from '../../ai';
  import GbcDropdown from './GbcDropdown.svelte';

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
    onStartGame: (player1Deck: DeckList, player2Deck: DeckList, options: { lassTest: boolean; fastBallTest: boolean; playmatImage: string; aiModel: string }) => void;
  }

  let { onStartGame }: Props = $props();

  let loading = $state(true);
  let deckOptions = $state<DeckOption[]>([]);
  let player1Deck = $state<string>('');
  let player2Deck = $state<string>('');
  let lassTest = $state(false);
  let fastBallTest = $state(false);
  let playmatImage = $state<string>('');
  let aiModel = $state<string>(MODEL_OPTIONS[0]?.id ?? '');

  // Discover playmat images from src/assets/playmat-images/
  const playmatModules = import.meta.glob('/src/assets/playmat-images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
  const playmatOptions: PlaymatOption[] = Object.entries(playmatModules).map(([path, url]) => {
    const filename = path.split('/').pop()?.replace('.png', '') ?? 'Unknown';
    const name = filename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { id: filename, name, url };
  });

  onMount(async () => {
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
    player1Deck = options[0]?.id ?? '';
    player2Deck = options[0]?.id ?? '';
    loading = false;
  });

  function handleStartGame() {
    const deck1 = deckOptions.find((d) => d.id === player1Deck);
    const deck2 = deckOptions.find((d) => d.id === player2Deck);

    if (deck1 && deck2) {
      playSfx('confirm');
      const selectedPlaymat = playmatOptions.find(p => p.id === playmatImage);
      onStartGame(deck1.deckList, deck2.deckList, { lassTest, fastBallTest, playmatImage: selectedPlaymat?.url ?? '', aiModel });
    }
  }

  function handleCheckboxChange() {
    playSfx('cursor');
  }
</script>

<div class="deck-select-container font-retro bg-gbc-bg min-h-screen w-screen flex flex-col items-center justify-center p-4 box-border relative">
  <div class="scanlines"></div>

  <div class="gbc-panel-lg max-w-2xl w-full">
    <h1 class="text-gbc-yellow text-xl text-center mb-8 tracking-wide title-shadow">
      POKEMON TCG
    </h1>

    {#if loading}
      <div class="text-gbc-yellow text-[0.6rem] text-center py-8">
        LOADING DECKS...
      </div>
    {:else}
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

      <!-- Playmat Selection -->
      {#if playmatOptions.length > 0}
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

      <div class="test-options flex justify-center gap-4 mb-4">
        <label class="gbc-checkbox flex items-center gap-2 cursor-pointer text-gbc-green text-[0.5rem]">
          <input type="checkbox" bind:checked={lassTest} onchange={handleCheckboxChange} />
          <span>LASS TEST</span>
        </label>
        <label class="gbc-checkbox flex items-center gap-2 cursor-pointer text-gbc-green text-[0.5rem]">
          <input type="checkbox" bind:checked={fastBallTest} onchange={handleCheckboxChange} />
          <span>FAST BALL TEST</span>
        </label>
      </div>

      <div class="flex justify-center">
        <button
          class="gbc-btn text-sm py-3 px-8 start-btn"
          onclick={handleStartGame}
          disabled={!player1Deck || !player2Deck}
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
