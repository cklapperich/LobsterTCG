import type { LanguageModel } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

export type AIProvider = 'fireworks' | 'anthropic' | 'glm';

export interface ProviderConfig {
  id: AIProvider;
  name: string;
  createModel: (modelId: string, apiKey: string) => LanguageModel;
  apiKeyEnv: string;
  defaultModels: Array<{ id: string; label: string; modelId: string }>;
}

const PROVIDER_REGISTRY: Record<AIProvider, ProviderConfig> = {
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks AI',
    createModel: (modelId, apiKey) => createFireworks({ apiKey })(modelId) as unknown as LanguageModel,
    apiKeyEnv: 'VITE_FIREWORKS_API_KEY',
    defaultModels: [
      { id: 'kimi-k2', label: 'Kimi K2', modelId: 'accounts/fireworks/models/kimi-k2' },
      { id: 'kimi-k2p5', label: 'Kimi K2.5', modelId: 'accounts/fireworks/models/kimi-k2p5' },
      { id: 'glm-4p7', label: 'GLM 4p7', modelId: 'accounts/fireworks/models/glm-4p7' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    createModel: (modelId, apiKey) => createAnthropic({ apiKey, baseURL: '/api/anthropic/v1' })(modelId) as unknown as LanguageModel,
    apiKeyEnv: 'VITE_ANTHROPIC_API_KEY',
    defaultModels: [
      { id: 'sonnet-4.5', label: 'Sonnet 4.5', modelId: 'claude-sonnet-4-5-20250929' },
    ],
  },
  glm: {
    id: 'glm',
    name: 'GLM',
    createModel: (modelId, apiKey) => createOpenAI({ apiKey, baseURL: 'https://api.z.ai/api/paas/v4' }).chat(modelId) as unknown as LanguageModel,
    apiKeyEnv: 'VITE_GLM_API_KEY',
    defaultModels: [
      { id: 'glm-5', label: 'GLM 5', modelId: 'glm-5' },
    ],
  },
};

export interface ModelOption {
  id: string;
  label: string;
  provider: AIProvider;
  modelId: string;
  apiKeyEnv: string;
}

// Auto-generated from registry
export const MODEL_OPTIONS: ModelOption[] = Object.values(PROVIDER_REGISTRY).flatMap(p => 
  p.defaultModels.map(m => ({
    id: m.id,
    label: m.label,
    provider: p.id,
    modelId: m.modelId,
    apiKeyEnv: p.apiKeyEnv,
  }))
);

// Default planner configuration
export const DEFAULT_PLANNER = {
  provider: 'anthropic' as const,
  modelId: 'claude-sonnet-4-5-20250929',
  apiKeyEnv: 'VITE_ANTHROPIC_API_KEY',
};

// Factory function
export function createModel(provider: AIProvider, modelId: string, apiKey: string): LanguageModel {
  const config = PROVIDER_REGISTRY[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);
  return config.createModel(modelId, apiKey);
}

// Helper to get model option by ID
export function getModelOptionById(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find(m => m.id === id);
}
