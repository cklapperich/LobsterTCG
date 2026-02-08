<script lang="ts">
  import { settings } from '../../lib/settings.svelte';
  import { playSfx } from '../../lib/audio.svelte';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

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
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="settings-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="settings-panel gbc-panel" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
    <!-- Header -->
    <div class="flex items-center justify-between py-1 px-2 bg-gbc-border">
      <span class="text-gbc-yellow text-[0.55rem] font-retro tracking-wide">SETTINGS</span>
      <button class="gbc-btn text-[0.45rem] py-0.5 px-2" onclick={onClose}>X</button>
    </div>

    <!-- Body -->
    <div class="p-3 flex flex-col gap-4">
      <!-- SFX Volume -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <span class="text-gbc-green text-[0.5rem] font-retro">SFX VOLUME</span>
          <span class="text-gbc-yellow text-[0.5rem] font-retro">{Math.round(settings.sfxVolume * 100)}%</span>
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
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <span class="text-gbc-green text-[0.5rem] font-retro">BGM VOLUME</span>
          <span class="text-gbc-yellow text-[0.5rem] font-retro">{Math.round(settings.bgmVolume * 100)}%</span>
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
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.searchToHand}
          onchange={handleToggle}
          class="gbc-check"
        />
        <div class="flex flex-col">
          <span class="text-gbc-green text-[0.5rem] font-retro">SEARCH TO HAND</span>
          <span class="text-gbc-light/60 text-[0.4rem] font-retro">Send searched cards to hand instead of staging</span>
        </div>
      </label>
    </div>

    <!-- Footer -->
    <div class="p-3 pt-0 flex justify-center">
      <button class="gbc-btn text-[0.55rem] py-1.5 px-6" onclick={onClose}>DONE</button>
    </div>
  </div>
</div>

<style>
  @reference "../../app.css";

  .settings-overlay {
    @apply fixed inset-0 z-[200] flex items-center justify-center;
    background: rgba(0, 0, 0, 0.7);
  }

  .settings-panel {
    @apply w-80;
  }

  .gbc-slider {
    @apply w-full h-3 appearance-none cursor-pointer rounded-none;
    background: var(--color-gbc-border);
  }

  .gbc-slider::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 cursor-pointer;
    background: var(--color-gbc-green);
    border: 2px solid var(--color-gbc-border);
  }

  .gbc-slider::-moz-range-thumb {
    @apply w-4 h-4 cursor-pointer rounded-none border-none;
    background: var(--color-gbc-green);
    border: 2px solid var(--color-gbc-border);
  }

  .gbc-slider::-moz-range-track {
    background: var(--color-gbc-border);
    height: 0.75rem;
  }

  .gbc-check {
    @apply appearance-none w-4 h-4 shrink-0 cursor-pointer;
    border: 2px solid var(--color-gbc-border);
    background: var(--color-gbc-cream);
  }

  .gbc-check:checked {
    background: var(--color-gbc-green);
    box-shadow: inset 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.2);
  }
</style>
