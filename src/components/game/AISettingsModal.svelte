<script lang="ts">
  import { playSfx } from '../../lib/audio.svelte';
  import { settings } from '../../lib/settings.svelte';
  import { MODEL_OPTIONS } from '../../ai/providers';
  import GbcDropdown from './GbcDropdown.svelte';

  interface Props {
    aiModel: string;
    aiMode: string;
    plannerModel: string;
    onClose: (values: { aiModel: string; aiMode: string; plannerModel: string }) => void;
  }

  let { aiModel, aiMode, plannerModel, onClose }: Props = $props();

  let localAiModel = $state(aiModel);
  let localAiMode = $state(aiMode);
  let localPlannerModel = $state(plannerModel);

  const hasApiKey = $derived(!!settings.openRouterApiKey);

  function handleDone() {
    playSfx('confirm');
    onClose({ aiModel: localAiModel, aiMode: localAiMode, plannerModel: localPlannerModel });
  }

  function handleCancel() {
    playSfx('cancel');
    onClose({ aiModel, aiMode, plannerModel });
  }

  function handleKeyInput(e: Event) {
    settings.openRouterApiKey = (e.target as HTMLInputElement).value;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="modal-overlay" onkeydown={(e) => e.key === 'Escape' && handleCancel()} role="dialog" tabindex="-1">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-panel gbc-panel" onkeydown={() => {}} role="dialog" tabindex="-1">
    <!-- Header -->
    <div class="flex items-center justify-between py-3 px-5 bg-gbc-border">
      <span class="text-gbc-yellow text-base font-retro tracking-wide">AI SETTINGS</span>
      <button class="gbc-btn text-sm py-1.5 px-4" onclick={handleCancel}>X</button>
    </div>

    <!-- Body -->
    <div class="p-6 flex flex-col gap-5">
      <!-- API Key -->
      <div class="flex flex-col gap-2">
        <div class="text-gbc-green text-sm font-retro flex items-center gap-2">
          <span class="player-badge bg-gbc-red text-gbc-cream px-2 py-1">KEY</span>
          OPENROUTER API KEY
        </div>
        <div class="text-gbc-light/70 text-xs font-retro leading-relaxed">
          Get a key at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" class="text-gbc-green underline">openrouter.ai</a> — create an account, add credits, then paste your key below.
        </div>
        <input
          type="password"
          value={settings.openRouterApiKey}
          oninput={handleKeyInput}
          placeholder="sk-or-..."
          class="gbc-input"
        />
        {#if hasApiKey}
          <span class="text-gbc-green text-xs font-retro">✓ KEY SET</span>
        {/if}
      </div>

      <hr class="border-gbc-border" />

      <!-- AI Mode Selection -->
      <div>
        <div class="text-gbc-green text-sm font-retro mb-3 flex items-center gap-2">
          <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">MODE</span>
          AI MODE
        </div>
        <GbcDropdown
          options={[
            { value: 'pipeline', label: 'Pipeline (Plan+Execute)' },
            { value: 'autonomous', label: 'Autonomous (Single Agent)' },
          ]}
          bind:value={localAiMode}
        />
      </div>

      <!-- Planner Model Selection (only in pipeline mode) -->
      {#if localAiMode === 'pipeline'}
        <div>
          <div class="text-gbc-green text-sm font-retro mb-3 flex items-center gap-2">
            <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">PLAN</span>
            PLANNER MODEL
          </div>
          <GbcDropdown
            options={MODEL_OPTIONS.map(m => ({ value: m.modelId, label: m.label }))}
            bind:value={localPlannerModel}
          />
        </div>
      {/if}

      <!-- AI Model Selection -->
      <div>
        <div class="text-gbc-green text-sm font-retro mb-3 flex items-center gap-2">
          <span class="player-badge bg-gbc-yellow text-gbc-border px-2 py-1">AI</span>
          {localAiMode === 'pipeline' ? 'EXECUTION MODEL' : 'AI MODEL'}
        </div>
        <GbcDropdown
          options={MODEL_OPTIONS.map(m => ({ value: m.modelId, label: m.label }))}
          bind:value={localAiModel}
        />
      </div>

      <!-- Actions -->
      <div class="flex gap-3 mt-2">
        <button
          class="gbc-btn text-sm py-3 px-6 flex-1"
          onclick={handleDone}
        >
          DONE
        </button>
        <button
          class="gbc-btn text-sm py-3 px-6 opacity-70"
          onclick={handleCancel}
        >
          CANCEL
        </button>
      </div>
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

  .player-badge {
    @apply font-retro text-xs tracking-wide;
    box-shadow: 0.125rem 0.125rem 0 var(--color-gbc-border);
  }

  .gbc-input {
    @apply w-full text-sm font-retro px-3 py-2.5 rounded-none outline-none;
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
