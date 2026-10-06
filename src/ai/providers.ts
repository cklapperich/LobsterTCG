import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const STORAGE_KEY = 'lobster-tcg-settings';

function getOpenRouterKey(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.openRouterApiKey) return parsed.openRouterApiKey;
    }
  } catch {
    // ignore
  }
  return import.meta.env.VITE_OPENROUTER_API_KEY ?? '';
}

/**
 * Resolve a model ID into a LanguageModel via OpenRouter.
 * Reads the API key from localStorage at call time, falling back to env var.
 */
export function resolveModel(modelId: string) {
  const openrouter = createOpenRouter({ apiKey: getOpenRouterKey() });
  return openrouter(modelId, {
    extraBody: { provider: { sort: 'throughput' } },
  });
}

// Cost per million tokens: [input, output]
export const MODEL_OPTIONS: ModelOption[] = [
  { label: 'GLM 5.3 Flash', modelId: 'z-ai/glm-5.3-flash', costPerMTok: [0.15, 0.50] },
  { label: 'Kimi K3', modelId: 'moonshotai/kimi-k3', costPerMTok: [0.83, 14.00] },
  { label: 'Claude Sonnet (latest)', modelId: '~anthropic/claude-sonnet-latest', costPerMTok: [2.00, 10.00] },
  { label: 'DeepSeek V4.1 Flash', modelId: 'deepseek/deepseek-v4.1-flash', costPerMTok: [0.01, 1.32] },
];

export interface ModelOption {
  label: string;
  modelId: string;
  costPerMTok: [number, number]; // [input, output] per million tokens
}

export const DEFAULT_PLANNER = MODEL_OPTIONS[2]; // Claude Sonnet (latest)

// Helper to get model option by label
export function getModelOptionByLabel(label: string): ModelOption | undefined {
  return MODEL_OPTIONS.find(m => m.label === label);
}
