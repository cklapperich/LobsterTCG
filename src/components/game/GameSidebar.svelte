<script lang="ts">
  import type { CardTemplate } from '../../core/types/card';
  import type { GameState } from '../../core/types/game';
  import type { CounterDefinition } from '../../core/types/counter';
  import type { MarkerState } from '../../core/types/game-plugin';
  import { PHASES } from '../../core/types/constants';
  import { isLocal, isAI, localPlayerIndex, type PlayerConfig } from './player-config';
  import { toggleMute, audioSettings } from '../../lib/audio.svelte';
  import { playSfx } from '../../lib/audio.svelte';
  import CounterTray from './CounterTray.svelte';

  interface Props {
    gameState: GameState<CardTemplate>;
    playerConfig: PlayerConfig;
    turnFlow: { tag: 'local' | 'waiting' | 'transition' };
    canLocalAct: boolean;
    decisionTargetsHuman: boolean;
    hasAI: boolean;
    counterDefinitions: CounterDefinition[];
    markers: MarkerState[];
    logEntries: string[];
    coinFlipIsFlipping: boolean;
    onBackToMenu?: () => void;
    onEndTurn: () => void;
    onMulligan: () => void;
    onResolveDecision: () => void;
    onRequest: () => void;
    onCoinFlip: () => void;
    onDebug: () => void;
    onNew: () => void;
    onSettings: () => void;
    onMarkerClick: (id: string) => void;
    onCounterReturn: () => void;
    onLogSubmit: (msg: string) => void;
  }

  let {
    gameState, playerConfig, turnFlow, canLocalAct, decisionTargetsHuman,
    hasAI, counterDefinitions, markers, logEntries, coinFlipIsFlipping,
    onBackToMenu, onEndTurn, onMulligan, onResolveDecision, onRequest,
    onCoinFlip, onDebug, onNew, onSettings, onMarkerClick, onCounterReturn, onLogSubmit,
  }: Props = $props();

  let logInput = $state('');
  let logEntriesEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    logEntries.length;
    if (logEntriesEl) logEntriesEl.scrollTop = logEntriesEl.scrollHeight;
  });
</script>

<div class="sidebar">
  <!-- Phase indicator -->
  <div class="gbc-panel phase-panel">
    <div class="phase-header">
      <h1 class="text-base max-sm:text-sm m-0 tracking-wide title-shadow font-retro phase-title text-center flex-1">
        {#if gameState.phase === PHASES.SETUP}
          {#if !gameState.setupComplete[localPlayerIndex(playerConfig)]}
            <span class="text-gbc-green">YOUR SETUP</span>
          {:else}
            <span class="text-gbc-blue animate-pulse">WAITING...</span>
          {/if}
        {:else if turnFlow.tag === 'waiting' || turnFlow.tag === 'transition'}
          <span class="text-gbc-red animate-pulse">THINKING...</span>
        {:else if decisionTargetsHuman}
          <span class="text-gbc-red animate-pulse">DECISION</span>
        {:else if gameState.pendingDecision && isAI(playerConfig, gameState.pendingDecision.targetPlayer)}
          <span class="text-gbc-blue animate-pulse">WAITING...</span>
        {:else if isLocal(playerConfig, gameState.activePlayer)}
          <span class="text-gbc-green">YOUR TURN</span>
        {:else}
          <span class="text-gbc-blue">FRIEND'S TURN</span>
        {/if}
      </h1>
      <span class="text-gbc-yellow text-[0.45rem] leading-none self-center">{gameState.turnNumber}</span>
      <button
        class="mute-btn"
        onclick={toggleMute}
        title={audioSettings.bgmMuted ? 'Unmute music' : 'Mute music'}
      >
        {#if audioSettings.bgmMuted}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M3.63 3.63a.75.75 0 0 1 1.06 0L21 19.37a.75.75 0 0 1-1.06 1.06l-3.33-3.33A7.47 7.47 0 0 1 12 19.5V21a.75.75 0 0 1-1.28.53L6 16.81H3a.75.75 0 0 1-.75-.75v-8.12c0-.41.34-.75.75-.75h3L6.72 6.5 3.63 4.69a.75.75 0 0 1 0-1.06ZM12 4.5a.75.75 0 0 1 .75.75v7.19l5.25 5.25V5.25a.75.75 0 0 0-1.28-.53L12 9.44V4.5Z"/>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"/>
            <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/>
          </svg>
        {/if}
      </button>
      <button
        class="mute-btn"
        onclick={() => { playSfx('cursor'); onSettings(); }}
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.463 7.463 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Decision message -->
  {#if decisionTargetsHuman && gameState.pendingDecision}
    <div class="gbc-panel decision-msg">
      <span class="text-gbc-yellow text-[0.45rem] font-retro tracking-wide">
        {gameState.pendingDecision.message ?? 'Your opponent requests an action'}
      </span>
    </div>
  {/if}

  <!-- Buttons -->
  <div class="sidebar-buttons">
    {#if decisionTargetsHuman}
      <button
        class="gbc-btn sidebar-btn"
        onclick={onResolveDecision}
        disabled={!gameState}
      >
        RESOLVE
      </button>
    {:else}
      <button
        class="gbc-btn sidebar-btn"
        onclick={onEndTurn}
        disabled={!canLocalAct}
      >
        {gameState.phase === PHASES.SETUP ? 'END SETUP' : 'END TURN'}
      </button>
    {/if}
    {#if gameState.phase === PHASES.SETUP}
      <button
        class="gbc-btn sidebar-btn"
        onclick={onMulligan}
        disabled={!canLocalAct}
      >
        MULLIGAN
      </button>
    {/if}
    {#if hasAI}
      <button
        class="gbc-btn sidebar-btn"
        onclick={onRequest}
        disabled={!canLocalAct || !!gameState.pendingDecision}
      >
        REQUEST
      </button>
    {/if}
    <button
      class="gbc-btn sidebar-btn"
      onclick={onCoinFlip}
      disabled={coinFlipIsFlipping}
    >
      COIN
    </button>
    <button class="gbc-btn sidebar-btn" onclick={onDebug}>DEBUG</button>
    <button class="gbc-btn sidebar-btn" onclick={onNew}>NEW</button>
    {#if onBackToMenu}
      <button class="gbc-btn sidebar-btn" onclick={onBackToMenu}>QUIT</button>
    {/if}
  </div>

  {#if counterDefinitions.length > 0}
    <CounterTray
      counters={counterDefinitions}
      onCounterReturn={onCounterReturn}
      {markers}
      onMarkerClick={onMarkerClick}
    />
  {/if}

  <div class="gbc-panel log-panel">
    <div class="log-header-btn">LOG</div>
    <div class="log-entries" bind:this={logEntriesEl}>
      {#each logEntries as entry}
        <div class="log-entry-inline" class:text-gbc-yellow={entry.startsWith('Warning:')} class:text-gbc-light={!entry.startsWith('Warning:')}>{entry}</div>
      {/each}
    </div>
    <form class="log-input-bar" onsubmit={(e) => {
      e.preventDefault();
      if (!logInput.trim()) return;
      onLogSubmit(logInput.trim());
      logInput = '';
    }}>
      <input
        type="text"
        class="log-input"
        placeholder="Type a message..."
        bind:value={logInput}
      />
    </form>
  </div>
</div>

<style>
  @reference "../../app.css";

  .title-shadow {
    text-shadow:
      0.125rem 0.125rem 0 var(--color-gbc-red),
      0.25rem 0.25rem 0 var(--color-gbc-border);
  }

  .phase-title {
    white-space: nowrap;
  }

  .sidebar {
    @apply flex flex-col gap-3 shrink-0 min-h-0 overflow-hidden;
    width: 20rem;
    height: 100%;
    @apply max-lg:w-full max-lg:flex-row max-lg:flex-wrap max-lg:justify-center max-lg:overflow-visible max-lg:h-auto;
  }

  .phase-panel {
    @apply py-2 px-3;
  }

  .phase-header {
    @apply flex items-center gap-1;
  }

  .mute-btn {
    @apply shrink-0 p-1 rounded-sm cursor-pointer;
    @apply text-gbc-light/60 hover:text-gbc-light;
    @apply bg-transparent border-none outline-none;
    transition: color 0.1s;
  }

  .decision-msg {
    @apply py-2 px-3 text-center;
  }

  .sidebar-buttons {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }

  .sidebar-btn {
    @apply text-[0.9rem] py-2 px-3 w-full;
  }

  .log-panel {
    @apply max-lg:w-auto flex flex-col flex-1 min-h-0 overflow-hidden;
  }

  .log-header-btn {
    @apply w-full text-gbc-yellow text-[0.9rem] text-center mb-2 py-1 px-2 bg-gbc-border font-retro;
  }

  .log-entries {
    @apply flex-1 min-h-0 overflow-y-auto px-2 py-1 flex flex-col gap-0.5;
  }

  .log-entry-inline {
    @apply text-[0.6rem] leading-snug break-words;
  }

  .log-input-bar {
    @apply px-2 py-1 border-t border-gbc-border;
  }

  .log-input {
    @apply w-full bg-gbc-dark-green text-gbc-light text-[0.9rem] px-2 py-1 border border-gbc-border rounded-sm;
    @apply outline-none;
  }

  .log-input::placeholder {
    @apply text-gbc-green/50;
  }

  .log-input:focus {
    @apply border-gbc-green;
  }
</style>
