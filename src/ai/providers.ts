import type { LanguageModel } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';

export type AIProvider = 'fireworks' | 'anthropic' | 'gateway';

// NOTE: All providers now use VITE_AI_GATEWAY_KEY for unified authentication
// Specialized providers (fireworks, anthropic) kept for specific use cases
// AI Gateway provides access to all models with automatic retries and failover

export interface ProviderConfig {
  id: AIProvider;
  name: string;
  createModel: (modelId: string, apiKey: string) => LanguageModel;
  apiKeyEnv: string;
  defaultModels: Array<{ id: string; label: string; modelId: string }>;
}

const PROVIDER_REGISTRY: Record<AIProvider, ProviderConfig> = {
  // Keep specialized providers where needed
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
   // AI Gateway for everything else - the magic silver bullet!
   gateway: {
     id: 'gateway',
     name: 'AI Gateway',
      createModel: (_modelId, _apiKey) => {
        // AI Gateway in SDK 6 just uses model strings directly, no createModel needed
        // All models accessed through unified VITE_AI_GATEWAY_KEY authentication
        // Note: For localhost development, ensure VITE_AI_GATEWAY_KEY is set in .env
        // For Vercel deployment, auth is automatic
        throw new Error('AI Gateway in SDK 6: Use model strings directly in streamText(), not createModel()');
      },
    apiKeyEnv: 'VITE_AI_GATEWAY_KEY',
    defaultModels: [
      // OpenAI models
      { id: 'gpt-5', label: 'GPT-5', modelId: 'openai/gpt-5' },
      { id: 'gpt-5-2', label: 'GPT-5.2', modelId: 'openai/gpt-5.2' },
      
      // Anthropic models  
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', modelId: 'anthropic/claude-sonnet-4-5-20250929' },
      
      // Google models
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', modelId: 'google/gemini-2.5-flash' },
      
      // Z.ai models (including GLM-5!)
      { id: 'glm-5', label: 'GLM-5', modelId: 'zai/glm-5' },
      { id: 'glm-4.7', label: 'GLM-4.7', modelId: 'zai/glm-4.7' },
      
      // xAI models
      { id: 'grok-2', label: 'Grok 2', modelId: 'xai/grok-2' },
      
      // Meta models
      { id: 'llama-3.1-70b', label: 'Llama 3.1 70B', modelId: 'meta/llama-3.1-70b' },
      
      // Keep existing OpenRouter GLM-5 for backward compatibility
      { id: 'openrouter-glm-5', label: 'GLM-5 (OpenRouter)', modelId: 'z-ai/glm-5' },
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
  if (provider === 'gateway') {
    // AI Gateway uses model strings directly in SDK 6
    // No createModel() needed - just pass the model string to streamText()
    throw new Error('AI Gateway in SDK 6: Use model strings directly in streamText(), not createModel()');
  }
  
  const config = PROVIDER_REGISTRY[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);
  return config.createModel(modelId, apiKey);
}

// Helper to get model option by ID
export function getModelOptionById(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find(m => m.id === id);
}
