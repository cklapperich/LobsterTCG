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
  { label: 'GLM-5', modelId: 'z-ai/glm-5', costPerMTok: [1.00, 3.20] },
  { label: 'Kimi K2.5', modelId: 'moonshotai/kimi-k2.5', costPerMTok: [0.60, 3.00] },
  { label: 'Claude Sonnet 4.6', modelId: 'anthropic/claude-sonnet-4-6', costPerMTok: [3.00, 15.00] },
  { label: 'DeepSeek V4 Flash', modelId: 'deepseek/deepseek-v4-flash', costPerMTok: [0.10, 0.20] },
  { label: 'DeepSeek V4 Pro', modelId: 'deepseek/deepseek-v4-pro', costPerMTok: [0.44, 0.87] },
];

export interface ModelOption {
  label: string;
  modelId: string;
  costPerMTok: [number, number]; // [input, output] per million tokens
}

export const DEFAULT_PLANNER = MODEL_OPTIONS[2]; // Claude Sonnet 4.6

// Helper to get model option by label
export function getModelOptionByLabel(label: string): ModelOption | undefined {
  return MODEL_OPTIONS.find(m => m.label === label);
}
