<script lang="ts">
  import { saveDeckToSupabase, updateDeckCards, deleteDeck, saveDeckStrategy } from '../../lib/deckSync';
  import { authState } from '../../lib/auth.svelte';
  import { playSfx } from '../../lib/audio.svelte';
  import { GAME_TYPES } from '../../game-types';
  import { generateDeckStrategy } from '../../lib/strategyGenerator';
  import { settings } from '../../lib/settings.svelte';
  import type { DeckList } from '../../core/types/deck';

  interface DeckOption {
    id: string;
    name: string;
    deckList: DeckList;
    cardCount: number;
    strategy: string;
    source: 'supabase' | 'file';
  }

  interface Props {
    deck?: DeckOption | null;
    gameType: string;
    onSave: (deck: DeckOption) => void;
    onDelete?: () => void;
    onClose: () => void;
  }

  let { deck = null, gameType, onSave, onDelete, onClose }: Props = $props();

  const gameConfig = $derived(GAME_TYPES[gameType]);
  const isEditing = $derived(!!deck);

  let deckName = $state(deck?.name ?? '');
  let pasteText = $state('');
  let saving = $state(false);
  let warnings = $state<string[]>([]);
  let errors = $state<string[]>([]);
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);
  let strategyText = $state(deck?.strategy ?? '');
  let generatingStrategy = $state(false);
  let savingStrategy = $state(false);
  let strategyError = $state('');

  const hasApiKey = $derived(!!settings.openRouterApiKey);

  // Pre-populate textarea when editing
  if (deck && gameConfig?.exportDeckText) {
    pasteText = gameConfig.exportDeckText(deck.deckList.cards);
  }

  async function handleSaveAndValidate() {
    if (!deckName.trim()) {
      errors = ['Deck name is required.'];
      return;
    }

    const user = authState.user;
    if (!user) {
      errors = ['You must be signed in to save decks.'];
      return;
    }

    saving = true;
    warnings = [];
    errors = [];

    if (!gameConfig?.parseDeckText) {
      errors = ['This game type does not support deck text import.'];
      saving = false;
      return;
    }

    const { deckList, warnings: parseWarnings } = gameConfig.parseDeckText(pasteText, deckName.trim());
    warnings = parseWarnings;

    if (deckList.cards.length === 0) {
      errors = ['No cards could be parsed from the input.'];
      saving = false;
      return;
    }

    const cardsRecord: Record<string, number> = {};
    for (const c of deckList.cards) {
      cardsRecord[c.templateId] = (cardsRecord[c.templateId] ?? 0) + c.count;
    }

    const cardCount = deckList.cards.reduce((sum, c) => sum + c.count, 0);
    const tcg = gameConfig?.tcgFilter ?? 'Pokemon';

    try {
      if (isEditing && deck) {
        // Extract raw Supabase ID from the sb- prefixed id
        const rawId = deck.id.startsWith('sb-') ? deck.id.slice(3) : deck.deckList.id;
        const ok = await updateDeckCards(rawId, deckName.trim(), cardsRecord);
        if (!ok) {
          errors = ['Failed to update deck in database.'];
          saving = false;
          return;
        }
        playSfx('confirm');
        onSave({
          id: deck.id,
          name: deckName.trim(),
          deckList: { ...deckList, id: rawId, name: deckName.trim() },
          cardCount,
          strategy: strategyText,
          source: 'supabase',
        });
      } else {
        const newId = await saveDeckToSupabase(user.id, tcg, deckName.trim(), cardsRecord);
        if (!newId) {
          errors = ['Failed to save deck to database.'];
          saving = false;
          return;
        }
        playSfx('confirm');
        onSave({
          id: `sb-${newId}`,
          name: deckName.trim(),
          deckList: { ...deckList, id: newId, name: deckName.trim() },
          cardCount,
          strategy: strategyText,
          source: 'supabase',
        });
      }
    } catch (e: any) {
      errors = [e.message ?? 'Failed to save deck.'];
      saving = false;
      return;
    }

    saving = false;
  }

  async function handleDelete() {
    if (!deck) return;
    deleting = true;
    const rawId = deck.id.startsWith('sb-') ? deck.id.slice(3) : deck.deckList.id;
    const ok = await deleteDeck(rawId);
    if (!ok) {
      errors = ['Failed to delete deck.'];
      deleting = false;
      showDeleteConfirm = false;
      return;
    }
    playSfx('confirm');
    deleting = false;
    onDelete?.();
  }

  async function handleGenerateStrategy() {
    if (!deck || generatingStrategy) return;
    generatingStrategy = true;
    strategyError = '';
    try {
      strategyText = await generateDeckStrategy(deck.deckList);
    } catch (e: any) {
      strategyError = e.message ?? 'Failed to generate strategy';
    } finally {
      generatingStrategy = false;
    }
  }

  async function handleSaveStrategy() {
    if (!deck || savingStrategy) return;
    const rawId = deck.id.startsWith('sb-') ? deck.id.slice(3) : deck.deckList.id;
    savingStrategy = true;
    strategyError = '';
    try {
      const ok = await saveDeckStrategy(rawId, strategyText);
      if (!ok) strategyError = 'Failed to save strategy';
    } catch (e: any) {
      strategyError = e.message ?? 'Failed to save strategy';
    } finally {
      savingStrategy = false;
    }
  }

  function handleClose() {
    playSfx('cancel');
    onClose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="modal-overlay" onkeydown={(e) => e.key === 'Escape' && handleClose()} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-panel gbc-panel" onkeydown={() => {}} role="dialog" tabindex="-1">
    <!-- Header -->
    <div class="flex items-center justify-between py-3 px-5 bg-gbc-border">
      <span class="text-gbc-yellow text-base font-retro tracking-wide">
        {isEditing ? `EDIT DECK` : 'NEW DECK'}
      </span>
      <button class="gbc-btn text-sm py-1.5 px-4" onclick={handleClose}>X</button>
    </div>

    <!-- Body -->
    <div class="p-6 flex flex-col gap-5">
      <!-- Deck name -->
      <div class="flex flex-col gap-2">
        <div class="text-gbc-green text-sm font-retro">DECK NAME</div>
        <input
          type="text"
          bind:value={deckName}
          placeholder="deck name here"
          class="gbc-input"
        />
      </div>

      <!-- Deckbuilder link -->
      {#if gameConfig?.deckbuilderLink}
        <div class="text-gbc-light/70 text-xs font-retro leading-relaxed">
          Build your deck at <a href={gameConfig.deckbuilderLink} target="_blank" rel="noopener noreferrer" class="text-gbc-green underline">{gameConfig.deckbuilderLink.replace('https://', '').replace('http://', '')}</a>, then paste the export below.
        </div>
      {/if}

      <!-- Paste area -->
      <div class="flex flex-col gap-2">
        <div class="text-gbc-green text-sm font-retro">DECK LIST (PTCGO FORMAT)</div>
        <textarea
          class="paste-textarea w-full bg-gbc-cream/10 text-gbc-light text-xs font-retro border-2 border-gbc-border p-3 resize-y leading-relaxed"
          rows="14"
          placeholder={"##Pokémon\n\n* 4 Charmander MEW 004\n* 3 Charmeleon OBF 027\n...\n\n##Trainer\n\n* 4 Arven PAF 235\n..."}
          bind:value={pasteText}
        ></textarea>
      </div>

      <!-- AI Strategy (only when editing) -->
      {#if isEditing}
        <div class="flex flex-col gap-2">
          <div class="text-gbc-green text-sm font-retro">AI DECK STRATEGY</div>
          <textarea
            class="strategy-textarea w-full bg-gbc-cream/10 text-gbc-light text-xs font-retro border-2 border-gbc-border p-3 resize-y leading-relaxed"
            rows="5"
            placeholder="No strategy yet. Generate one or type your own."
            bind:value={strategyText}
          ></textarea>
          <div class="flex gap-3">
            <button
              class="gbc-btn text-xs py-2 px-4"
              onclick={handleGenerateStrategy}
              disabled={!hasApiKey || generatingStrategy}
            >
              {generatingStrategy ? 'GENERATING...' : 'GENERATE STRATEGY'}
            </button>
            {#if deck?.source === 'supabase'}
              <button
                class="gbc-btn text-xs py-2 px-4"
                onclick={handleSaveStrategy}
                disabled={savingStrategy}
              >
                {savingStrategy ? 'SAVING...' : 'SAVE STRATEGY'}
              </button>
            {/if}
          </div>
          {#if strategyError}
            <div class="text-gbc-red text-xs font-retro">{strategyError}</div>
          {/if}
        </div>
      {/if}

      <!-- Warnings / Errors -->
      {#if errors.length > 0}
        <div class="flex flex-col gap-1">
          {#each errors as err}
            <div class="text-gbc-red text-xs font-retro">{err}</div>
          {/each}
        </div>
      {/if}
      {#if warnings.length > 0}
        <div class="flex flex-col gap-1">
          <div class="text-gbc-yellow text-xs font-retro">WARNINGS ({warnings.length})</div>
          <div class="warnings-list">
            {#each warnings as w}
              <div class="text-gbc-yellow/80 text-[0.6rem] font-retro">{w}</div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex gap-3 mt-2">
        <button
          class="gbc-btn text-sm py-3 px-6 flex-1"
          onclick={handleSaveAndValidate}
          disabled={saving}
        >
          {saving ? 'SAVING...' : 'SAVE & VALIDATE'}
        </button>
        <button
          class="gbc-btn text-sm py-3 px-6 opacity-70"
          onclick={handleClose}
        >
          CANCEL
        </button>
      </div>

      {#if isEditing && deck?.source === 'supabase'}
        <div class="flex justify-center mt-2">
          {#if showDeleteConfirm}
            <div class="flex flex-col items-center gap-3">
              <div class="text-gbc-red text-sm font-retro">DELETE THIS DECK?</div>
              <div class="flex gap-3">
                <button
                  class="gbc-btn text-xs py-2 px-5 !bg-gbc-red"
                  onclick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'DELETING...' : 'YES, DELETE'}
                </button>
                <button
                  class="gbc-btn text-xs py-2 px-5"
                  onclick={() => { showDeleteConfirm = false; }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          {:else}
            <button
              class="text-gbc-red/60 hover:text-gbc-red text-xs font-retro bg-transparent border-none cursor-pointer underline"
              onclick={() => { showDeleteConfirm = true; }}
            >
              DELETE DECK
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  @reference "../../app.css";

  .modal-overlay {
    @apply fixed inset-0 z-[200] flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .modal-panel {
    @apply w-[40rem] max-h-[90vh] overflow-y-auto;
  }

  .paste-textarea {
    @apply outline-none;
    min-height: 10rem;
    max-height: 24rem;
  }

  .paste-textarea:focus,
  .strategy-textarea:focus {
    border-color: var(--color-gbc-green);
  }

  .strategy-textarea {
    @apply outline-none;
    min-height: 4rem;
    max-height: 12rem;
  }

  .warnings-list {
    max-height: 6rem;
    overflow-y: auto;
  }

  .gbc-input {
    @apply w-full text-sm font-retro px-3 py-2.5 rounded-none outline-none;
    background: transparent;
    border: 2px solid var(--color-gbc-border);
    color: var(--color-gbc-light);
    caret-color: var(--color-gbc-yellow);
  }

  .gbc-input:focus {
    border-color: var(--color-gbc-yellow);
    background: rgba(255, 255, 255, 0.05);
  }

  .gbc-input::placeholder {
    color: var(--color-gbc-light);
    opacity: 0.35;
  }

  .gbc-input:focus::placeholder {
    opacity: 0;
  }
</style>
