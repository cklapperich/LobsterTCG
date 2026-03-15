<script lang="ts">
  import { settings } from '../../lib/settings.svelte';
  import { playSfx } from '../../lib/audio.svelte';

  let visible = $state(false);

  export function show() { visible = true; }

  function handleClose() {
    visible = false;
    playSfx('cancel');
  }

  function handleSfxChange(e: Event) {
    const val = (e.target as HTMLInputElement).valueAsNumber;
    settings.sfxVolume = val / 100;
  }

  function handleBgmChange(e: Event) {
    const val = (e.target as HTMLInputElement).valueAsNumber;
    settings.bgmVolume = val / 100;
  }

  function handleSfxCommit() {
    playSfx('cursor');
  }

  function handleToggle() {
    settings.searchToHand = !settings.searchToHand;
    playSfx('cursor');
  }

  function handleDblClickDeckToggle() {
    settings.dblClickDeckToDraw = !settings.dblClickDeckToDraw;
    playSfx('cursor');
  }

  function handleSplashDurationChange(e: Event) {
    settings.splashDuration = (e.target as HTMLInputElement).valueAsNumber;
  }

  function handleOpenRouterKeyChange(e: Event) {
    settings.openRouterApiKey = (e.target as HTMLInputElement).value;
  }
</script>

{#if visible}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="settings-overlay" onclick={handleClose} onkeydown={(e) => e.key === 'Escape' && handleClose()} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="settings-panel gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
    <!-- Header -->
    <div class="flex items-center justify-between py-2 px-4 bg-gbc-border">
      <span class="text-gbc-yellow text-sm font-retro tracking-wide">SETTINGS</span>
      <button class="gbc-btn text-xs py-1 px-3" onclick={handleClose}>X</button>
    </div>

    <!-- Body -->
    <div class="p-5 flex flex-col gap-5">
      <!-- API Key -->
      <div class="flex flex-col gap-1.5">
        <div class="text-gbc-yellow text-sm font-retro">OPENROUTER API KEY</div>
        <div class="text-gbc-light/60 text-xs font-retro leading-relaxed">
          Required for AI opponents. Get a key at <span class="text-gbc-green">openrouter.ai</span>.
        </div>
        <input
          type="password"
          value={settings.openRouterApiKey}
          oninput={handleOpenRouterKeyChange}
          placeholder="sk-or-..."
          class="gbc-input"
        />
        {#if settings.openRouterApiKey}
          <span class="text-gbc-green text-xs font-retro mt-0.5">✓ KEY SET</span>
        {/if}
      </div>

      <hr class="border-gbc-border" />

      <!-- SFX Volume -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-gbc-green text-sm font-retro">SFX VOLUME</span>
          <span class="text-gbc-yellow text-sm font-retro">{Math.round(settings.sfxVolume * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(settings.sfxVolume * 100)}
          oninput={handleSfxChange}
          onchange={handleSfxCommit}
          class="gbc-slider"
        />
      </div>

      <!-- BGM Volume -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-gbc-green text-sm font-retro">BGM VOLUME</span>
          <span class="text-gbc-yellow text-sm font-retro">{Math.round(settings.bgmVolume * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(settings.bgmVolume * 100)}
          oninput={handleBgmChange}
          class="gbc-slider"
        />
      </div>

      <!-- Search to Hand -->
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.searchToHand}
          onchange={handleToggle}
          class="gbc-check"
        />
        <div class="flex flex-col gap-0.5">
          <span class="text-gbc-green text-sm font-retro">SEARCH TO HAND</span>
          <span class="text-gbc-light/60 text-xs font-retro">Send searched cards to hand instead of staging</span>
        </div>
      </label>

      <!-- Double-click deck to draw -->
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.dblClickDeckToDraw}
          onchange={handleDblClickDeckToggle}
          class="gbc-check"
        />
        <div class="flex flex-col gap-0.5">
          <span class="text-gbc-green text-sm font-retro">DOUBLE-CLICK DECK TO DRAW</span>
          <span class="text-gbc-light/60 text-xs font-retro">Double-clicking your deck draws a card instead of flipping it</span>
        </div>
      </label>

      <!-- Splash duration -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-gbc-green text-sm font-retro">SPLASH DURATION</span>
          <span class="text-gbc-yellow text-sm font-retro">{settings.splashDuration}ms</span>
        </div>
        <input
          type="range"
          min="500"
          max="4000"
          step="100"
          value={settings.splashDuration}
          oninput={handleSplashDurationChange}
          class="gbc-slider"
        />
      </div>

    </div>

    <!-- Footer -->
    <div class="p-5 pt-0 flex justify-center">
      <button class="gbc-btn text-sm py-2 px-8" onclick={handleClose}>DONE</button>
    </div>
  </div>
</div>
{/if}

<style>
  @reference "../../app.css";

  .settings-overlay {
    @apply fixed inset-0 z-[200] flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .settings-panel {
    @apply w-[28rem];
  }

  .gbc-slider {
    @apply w-full h-4 appearance-none cursor-pointer rounded-none;
    background: var(--color-gbc-border);
  }

  .gbc-slider::-webkit-slider-thumb {
    @apply appearance-none w-5 h-5 cursor-pointer;
    background: var(--color-gbc-green);
    border: 2px solid var(--color-gbc-border);
  }

  .gbc-slider::-moz-range-thumb {
    @apply w-5 h-5 cursor-pointer rounded-none border-none;
    background: var(--color-gbc-green);
    border: 2px solid var(--color-gbc-border);
  }

  .gbc-slider::-moz-range-track {
    background: var(--color-gbc-border);
    height: 1rem;
  }

  .gbc-check {
    @apply appearance-none w-5 h-5 shrink-0 cursor-pointer;
    border: 2px solid var(--color-gbc-border);
    background: var(--color-gbc-cream);
  }

  .gbc-check:checked {
    background: var(--color-gbc-green);
    box-shadow: inset 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.2);
  }

  .gbc-input {
    @apply w-full text-xs font-retro px-3 py-2 rounded-none outline-none;
    background: var(--color-gbc-cream);
    border: 2px solid var(--color-gbc-border);
    color: var(--color-gbc-dark);
  }

  .gbc-input:focus {
    border-color: var(--color-gbc-green);
  }

  .gbc-input::placeholder {
    color: var(--color-gbc-border);
  }
</style>
