import { createGateway } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

// AI Gateway for Anthropic models (proxied through Vite to avoid CORS)
const gateway = createGateway({
  baseURL: '/ai-gateway/v3/ai',
  apiKey: import.meta.env.VITE_AI_GATEWAY_KEY,
});

// OpenRouter for GLM-5, Kimi K2.5, etc.
const openrouter = createOpenRouter({
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
});

/**
 * Resolve a model ID into a LanguageModel.
 * Anthropic models route through AI Gateway; others through OpenRouter.
 */
export function resolveModel(modelId: string) {
  if (modelId.startsWith('anthropic/')) {
    return gateway(modelId as any);
  }
  return openrouter(modelId, {
    extraBody: { provider: { sort: 'throughput' } },
  });
}

// Cost per million tokens: [input, output]
export const MODEL_OPTIONS: ModelOption[] = [
  { label: 'GLM-5', modelId: 'z-ai/glm-5', costPerMTok: [1.00, 3.20] },
  { label: 'Kimi K2.5', modelId: 'moonshotai/kimi-k2.5', costPerMTok: [0.60, 3.00] },
  { label: 'Claude Sonnet 4.5', modelId: 'anthropic/claude-sonnet-4-5-20250929', costPerMTok: [3.00, 15.00] },
];

export interface ModelOption {
  label: string;
  modelId: string;
  costPerMTok: [number, number]; // [input, output] per million tokens
}

export const DEFAULT_PLANNER = MODEL_OPTIONS[0];

// Helper to get model option by label
export function getModelOptionByLabel(label: string): ModelOption | undefined {
  return MODEL_OPTIONS.find(m => m.label === label);
}
