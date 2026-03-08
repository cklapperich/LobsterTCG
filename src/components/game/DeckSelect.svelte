<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckList, DeckSelection } from '../../core';
  import { parsePTCGODeck } from '../../plugins/pokemon/cards';
  import { playSfx } from '../../lib/audio.svelte';
  import SettingsModal from './SettingsModal.svelte';
  import { MODEL_OPTIONS, DEFAULT_PLANNER } from '../../ai';
  import { DEFAULT_CONFIG, type PlayerConfig } from './player-config';
  import GbcDropdown from './GbcDropdown.svelte';
  import { GAME_TYPES, DEFAULT_GAME_TYPE } from '../../game-types';
  import { authState, signInWithGoogle, signOut } from '../../lib/auth.svelte';
  import { loadDecksFromSupabase, saveDeckStrategy } from '../../lib/deckSync';
  import { generateDeckStrategy } from '../../lib/strategyGenerator';
  import { settings } from '../../lib/settings.svelte';

  interface DeckOption {
    id: string;
    name: string;
    deckList: DeckList;
    cardCount: number;
    strategy: string;
    source: 'supabase' | 'file';
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
    onPlayOnline?: (opts: { deck: DeckSelection; gameType: string; playmatImage: string }) => void;
  }

  let { onStartGame, onPlayOnline }: Props = $props();

  let gameType = $state<string>(DEFAULT_GAME_TYPE);
  let loading = $state(true);
  let deckOptions = $state<DeckOption[]>([]);
  let player1Deck = $state<string>('7-19 torrential-cannon');
  let player2Deck = $state<string>('7-18 relentless-flame');
  let testFlags = $state<Record<string, boolean>>({});
  let playmatImage = $state<string>('');
  let aiModel = $state<string>('moonshotai/kimi-k2.5');
  let aiMode = $state<string>('pipeline');
  let plannerModel = $state<string>(DEFAULT_PLANNER.modelId);
  let showSettings = $state(false);
  let strategyText = $state('');
  let strategyDeckId = $state('');
  let generatingStrategy = $state(false);
  let savingStrategy = $state(false);
  let strategyError = $state('');

  const gameConfig = $derived(GAME_TYPES[gameType]);
  const selectedP2Deck = $derived(deckOptions.find(d => d.id === player2Deck));

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

  let fileDecks = $state<DeckOption[]>([]);
  let supabaseDecks = $state<DeckOption[]>([]);

  onMount(async () => {
    await loadFileDecks();
  });

  async function loadFileDecks() {
    if (!gameConfig?.needsDeckSelection) {
      loading = false;
      return;
    }

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
          source: 'file',
        });
      } catch (e) {
        console.error(`Failed to load deck ${deckName}:`, e);
      }
    }));

    fileDecks = options;
    loading = false;
  }

  async function loadSupabaseDecks() {
    const user = authState.user;
    const tcgFilter = gameConfig?.tcgFilter;
    if (!user || !tcgFilter) {
      supabaseDecks = [];
      return;
    }

    const rows = await loadDecksFromSupabase(user.id, tcgFilter);
    supabaseDecks = rows.map(row => {
      const cards = Object.entries(row.cards).map(([templateId, count]) => ({ templateId, count }));
      const cardCount = cards.reduce((sum, c) => sum + c.count, 0);
      return {
        id: `sb-${row.id}`,
        name: row.name,
        deckList: { id: row.id, name: row.name, cards },
        cardCount,
        strategy: row.strategy,
        source: 'supabase' as const,
      };
    });
  }

  // Merge supabase decks (top) + file decks (bottom)
  $effect(() => {
    const merged = [...supabaseDecks, ...fileDecks];
    deckOptions = merged;
    if (!player1Deck || !merged.find(d => d.id === player1Deck)) {
      player1Deck = merged[0]?.id ?? '';
    }
    if (!player2Deck || !merged.find(d => d.id === player2Deck)) {
      player2Deck = merged[0]?.id ?? '';
    }
  });

  // Re-load file decks when game type changes
  $effect(() => {
    gameType;
    loading = true;
    fileDecks = [];
    supabaseDecks = [];
    testFlags = {};
    loadFileDecks();
    loadSupabaseDecks();
  });

  // Re-load supabase decks when auth state changes
  $effect(() => {
    authState.user;
    loadSupabaseDecks();
  });

  $effect(() => {
    if (selectedP2Deck && selectedP2Deck.id !== strategyDeckId) {
      strategyText = selectedP2Deck.strategy ?? '';
      strategyDeckId = selectedP2Deck.id;
      strategyError = '';
    }
  });

  async function handleGenerateStrategy() {
    if (!selectedP2Deck || generatingStrategy) return;
    generatingStrategy = true;
    strategyError = '';
    try {
      const text = await generateDeckStrategy(selectedP2Deck.deckList);
      strategyText = text;
      selectedP2Deck.strategy = text;
    } catch (e: any) {
      strategyError = e.message ?? 'Failed to generate strategy';
    } finally {
      generatingStrategy = false;
    }
  }

  async function handleSaveStrategy() {
    if (!selectedP2Deck || savingStrategy) return;
    const rawId = selectedP2Deck.deckList.id;
    savingStrategy = true;
    strategyError = '';
    try {
      const ok = await saveDeckStrategy(rawId, strategyText);
      if (!ok) strategyError = 'Failed to save strategy';
      else selectedP2Deck.strategy = strategyText;
    } catch (e: any) {
      strategyError = e.message ?? 'Failed to save strategy';
    } finally {
      savingStrategy = false;
    }
  }

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

  const hasApiKey = $derived(!!settings.openRouterApiKey);

  const canStart = $derived(
    gameConfig && (!gameConfig.needsDeckSelection || (player1Deck && player2Deck))
  );

  const canPlayOnline = $derived(
    onPlayOnline && gameConfig?.needsDeckSelection && !!player1Deck
  );

  function handlePlayOnline() {
    if (!gameConfig) return;
    const deck1 = deckOptions.find((d) => d.id === player1Deck);
    if (!deck1) return;
    playSfx('confirm');
    const selectedPlaymat = playmatOptions.find(p => p.id === playmatImage);
    onPlayOnline?.({
      deck: { deckList: deck1.deckList, strategy: deck1.strategy },
      gameType,
      playmatImage: selectedPlaymat?.url ?? '',
    });
  }
</script>

<div class="deck-select-container font-retro bg-gbc-bg min-h-screen w-screen flex flex-col items-center justify-center p-4 box-border relative">
  <div class="scanlines"></div>

  <div class="gbc-panel-lg max-w-2xl w-full relative">
    <button
      class="settings-btn"
      onclick={() => { showSettings = true; playSfx('cursor'); }}
      title="Settings"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.463 7.463 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd"/>
      </svg>
    </button>
    <h1 class="text-gbc-yellow text-xl text-center mb-8 tracking-wide title-shadow">
      {gameConfig?.name ?? 'LOBSTER TCG'}
    </h1>

    <!-- Auth Section -->
    <div class="auth-section mb-6 text-center">
      {#if authState.loading}
        <span class="text-gbc-light text-[0.5rem]">...</span>
      {:else if authState.user}
        <div class="flex items-center justify-center gap-3 text-[0.5rem]">
          <span class="text-gbc-green">{authState.user.email}</span>
          <button class="text-gbc-light/60 hover:text-gbc-light underline cursor-pointer bg-transparent border-none font-retro text-[0.5rem]" onclick={() => signOut()}>
            SIGN OUT
          </button>
        </div>
      {:else}
        <button
          class="gbc-btn text-[0.5rem] py-1.5 px-4"
          onclick={() => signInWithGoogle()}
        >
          SIGN IN WITH GOOGLE
        </button>
      {/if}
    </div>

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
              <span class="player-badge bg-gbc-red text-gbc-cream px-2 py-1">YOU</span>
              YOUR DECK
            </div>
            <GbcDropdown
              options={deckOptions.map(d => ({ value: d.id, label: `${d.source === 'supabase' ? '★ ' : ''}${d.name} (${d.cardCount} cards)` }))}
              bind:value={player1Deck}
            />
          </div>

          <!-- Player 2 Deck Selection -->
          <div class="player-select">
            <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
              <span class="player-badge bg-gbc-blue text-gbc-cream px-2 py-1">AI</span>
              AI DECK
            </div>
            <GbcDropdown
              options={deckOptions.map(d => ({ value: d.id, label: `${d.source === 'supabase' ? '★ ' : ''}${d.name} (${d.cardCount} cards)` }))}
              bind:value={player2Deck}
            />
          </div>

          <!-- AI Deck Strategy -->
          <div class="strategy-section">
            <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
              <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">STRAT</span>
              AI DECK STRATEGY
            </div>
            <textarea
              class="strategy-textarea w-full bg-gbc-cream/10 text-gbc-light text-[0.5rem] font-retro border-2 border-gbc-border p-2 resize-y leading-relaxed"
              rows="6"
              placeholder="No strategy yet. Generate one or type your own."
              bind:value={strategyText}
              oninput={() => { if (selectedP2Deck) selectedP2Deck.strategy = strategyText; }}
            ></textarea>
            <div class="flex gap-2 mt-2">
              <button
                class="gbc-btn text-[0.45rem] py-1.5 px-3"
                onclick={handleGenerateStrategy}
                disabled={!hasApiKey || generatingStrategy}
              >
                {generatingStrategy ? 'GENERATING...' : 'GENERATE WITH OPUS'}
              </button>
              {#if selectedP2Deck?.source === 'supabase'}
                <button
                  class="gbc-btn text-[0.45rem] py-1.5 px-3"
                  onclick={handleSaveStrategy}
                  disabled={savingStrategy}
                >
                  {savingStrategy ? 'SAVING...' : 'SAVE STRATEGY'}
                </button>
              {/if}
            </div>
            {#if strategyError}
              <div class="text-gbc-red text-[0.45rem] mt-1">{strategyError}</div>
            {/if}
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
        <!-- AI Section -->
        <div class="ai-section mb-4" class:ai-locked={!hasApiKey}>
          <!-- Key missing: instructions + button -->
          {#if !hasApiKey}
            <div class="api-key-prompt mb-3">
              <div class="text-gbc-yellow text-[0.55rem] font-retro mb-1">▶ PLAY VS BOT</div>
              <div class="text-gbc-light/70 text-[0.45rem] font-retro leading-relaxed mb-2">
                Visit <span class="text-gbc-green">openrouter.ai</span>, create an account, add credits, then copy your API key and paste it below.
              </div>
              <button
                class="gbc-btn text-[0.5rem] py-1.5 px-4 w-full"
                onclick={() => { showSettings = true; playSfx('cursor'); }}
              >
                SET OPENROUTER API KEY
              </button>
            </div>
          {/if}

          <!-- AI options (greyed when locked) -->
          <div class:opacity-40={!hasApiKey} class:pointer-events-none={!hasApiKey}>
            <!-- AI Model Selection -->
            <div class="model-select mb-4">
              <div class="player-label text-gbc-green text-[0.6rem] mb-3 flex items-center gap-2">
                <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">AI</span>
                AI MODEL
              </div>
              <GbcDropdown
                options={MODEL_OPTIONS.map(m => ({ value: m.modelId, label: m.label }))}
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
                  options={MODEL_OPTIONS.map(m => ({ value: m.modelId, label: m.label }))}
                  bind:value={plannerModel}
                />
              </div>
            {/if}
          </div>
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

      <div class="flex justify-center gap-4 flex-wrap">
        <button
          class="gbc-btn text-sm py-3 px-8 start-btn"
          onclick={handleStartGame}
          disabled={!canStart}
        >
          START GAME
        </button>
        {#if canPlayOnline}
          <button
            class="gbc-btn text-sm py-3 px-8 online-btn"
            onclick={handlePlayOnline}
          >
            PLAY ONLINE
          </button>
        {/if}
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

  .strategy-textarea {
    @apply outline-none;
    min-height: 4rem;
    max-height: 12rem;
  }

  .strategy-textarea:focus {
    border-color: var(--color-gbc-green);
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

  .online-btn {
    @apply tracking-wider;
    background-color: var(--color-gbc-blue);
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
