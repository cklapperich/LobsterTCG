<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckList, DeckSelection } from '../../core';
  import { parsePTCGODeck } from '../../plugins/pokemon/cards';
  import { playSfx } from '../../lib/audio.svelte';
  import SettingsModal from './SettingsModal.svelte';
  import { MODEL_OPTIONS, PLANNER_CONFIG } from '../../ai';
  import { DEFAULT_CONFIG, type PlayerConfig } from './player-config';
  import GbcDropdown from './GbcDropdown.svelte';
  import { GAME_TYPES, DEFAULT_GAME_TYPE } from '../../game-types';

  interface DeckOption {
    id: string;
    name: string;
    deckList: DeckList;
    cardCount: number;
    strategy: string;
  }

  interface PlaymatOption {
    id: string;
    name: string;
    url: string;
  }

  interface Props {
    onStartGame: (options: {
      gameType: string;
      decks?: DeckSelection[];
      testFlags: Record<string, boolean>;
      playmatImage: string;
      aiModel: string;
      aiMode: string;
      plannerModel?: string;
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
  let plannerModel = $state<string>(PLANNER_CONFIG.MODEL === 'claude-sonnet-4-5-20250929' ? 'sonnet-4.5' : PLANNER_CONFIG.MODEL);
  let showSettings = $state(false);

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

    // Fetch deck manifest from public directory
    const basePath = `/${gameType}/decks`;
    let deckNames: string[];
    try {
      const res = await fetch(`${basePath}/index.json`);
      if (!res.ok) throw new Error(`Failed to fetch deck index: ${res.status}`);
      deckNames = await res.json();
    } catch (e) {
      console.error('Failed to load deck index:', e);
      loading = false;
      return;
    }

    const options: DeckOption[] = [];

    // Fetch each deck file + optional strategy file in parallel
    await Promise.all(deckNames.map(async (deckName) => {
      try {
        const encoded = encodeURIComponent(deckName);
        const [deckRes, stratRes] = await Promise.all([
          fetch(`${basePath}/${encoded}.txt`),
          fetch(`${basePath}/${encoded}_strategy.txt`).catch(() => null),
        ]);
        if (!deckRes.ok) throw new Error(`HTTP ${deckRes.status}`);
        const content = await deckRes.text();
        const stratIsText = stratRes?.ok && !stratRes.headers.get('content-type')?.includes('text/html');
        const strategy = stratIsText ? await stratRes.text() : '';
        const displayName = deckName.charAt(0).toUpperCase() + deckName.slice(1);

        const { deckList, warnings } = parsePTCGODeck(content, displayName);
        const cardCount = deckList.cards.reduce((sum, c) => sum + c.count, 0);

        if (warnings.length > 0) {
          console.warn(`Warnings parsing ${deckName}:`, warnings);
        }

        options.push({
          id: deckName,
          name: displayName,
          deckList,
          cardCount,
          strategy,
        });
      } catch (e) {
        console.error(`Failed to load deck ${deckName}:`, e);
      }
    }));

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
    gameType; // Access to make this effect reactive
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
        decks: [
          { deckList: deck1.deckList, strategy: deck1.strategy },
          { deckList: deck2.deckList, strategy: deck2.strategy },
        ],
        testFlags,
        playmatImage: selectedPlaymat?.url ?? '',
        aiModel,
        aiMode,
        plannerModel: aiMode === 'pipeline' ? plannerModel : undefined,
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
        plannerModel: aiMode === 'pipeline' ? plannerModel : undefined,
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

  <div class="gbc-panel-lg max-w-2xl w-full relative">
    <button
      class="settings-btn"
      onclick={() => { showSettings = true; playSfx('cursor'); }}
      title="Settings"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.463 7.463 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd"/>
      </svg>
    </button>
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

        <!-- Planner Model Selection (only in pipeline mode) -->
        {#if aiMode === 'pipeline'}
          <div class="model-select mb-4">
            <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
              <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">PLAN</span>
              PLANNER MODEL
            </div>
            <GbcDropdown
              options={MODEL_OPTIONS.map(m => ({ value: m.id, label: m.label }))}
              bind:value={plannerModel}
            />
          </div>
        {/if}
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

  {#if showSettings}
    <SettingsModal onClose={() => { showSettings = false; playSfx('cancel'); }} />
  {/if}
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

  .settings-btn {
    @apply absolute top-3 right-3 p-1.5 rounded-sm cursor-pointer;
    @apply text-gbc-light/60 hover:text-gbc-light;
    @apply bg-transparent border-none outline-none;
    transition: color 0.1s;
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
