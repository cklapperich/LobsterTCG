import { describe, it, expect } from 'vitest';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createModel, MODEL_OPTIONS } from './providers';
    
const AI_GATEWAY_API_KEY = process.env.VITE_AI_GATEWAY_KEY;

describe('AI Providers Integration Tests', () => {
  it('MODEL_OPTIONS should include all providers', () => {
    const providerIds = MODEL_OPTIONS.map(option => option.provider);
    expect(providerIds).toContain('fireworks');
    expect(providerIds).toContain('anthropic');
    expect(providerIds).toContain('gateway');
  });

  it('Should create models for non-gateway providers', () => {
    // Test that model creation doesn't throw for valid configs
    expect(() => {
      const fireworksModel = createModel('fireworks', 'accounts/fireworks/models/kimi-k2', 'test-key');
      expect(fireworksModel).toBeDefined();
    }).not.toThrow();

    expect(() => {
      const anthropicModel = createModel('anthropic', 'claude-sonnet-4-5-20250929', 'test-key');
      expect(anthropicModel).toBeDefined();
    }).not.toThrow();
  });

  it('Gateway createModel should throw helpful error', () => {
    // Gateway uses model strings directly in SDK 6, should throw error when trying to createModel
    expect(() => {
      createModel('gateway', 'zai/glm-5', 'test-key');
    }).toThrow('AI Gateway in SDK 6: Use model strings directly in streamText(), not createModel()');
  });

  it('Should have correct environment variables configured', () => {
    const gatewayOption = MODEL_OPTIONS.find(m => m.provider === 'gateway');
    expect(gatewayOption).toBeDefined();
    expect(gatewayOption?.apiKeyEnv).toBe('VITE_AI_GATEWAY_KEY');
  });

  it('Should have correct model IDs for AI Gateway', () => {
    const glm5Option = MODEL_OPTIONS.find(m => m.provider === 'gateway' && m.id === 'glm-5');
    expect(glm5Option).toBeDefined();
    expect(glm5Option?.modelId).toBe('zai/glm-5');

    const gpt5Option = MODEL_OPTIONS.find(m => m.provider === 'gateway' && m.id === 'gpt-5');
    expect(gpt5Option).toBeDefined();
    expect(gpt5Option?.modelId).toBe('openai/gpt-5');

    const claudeOption = MODEL_OPTIONS.find(m => m.provider === 'gateway' && m.id === 'claude-sonnet-4.5');
    expect(claudeOption).toBeDefined();
    expect(claudeOption?.modelId).toBe('anthropic/claude-sonnet-4-5-20250929');
  });

  describe('Tool Call Tests', () => {
    it('should call a tool and verify input structure (SDK 6)', async () => {
      const testTool = tool({
        description: 'Echo back a message',
        inputSchema: z.object({
          message: z.string().describe('The message to echo'),
        }),
        execute: async ({ message }: { message: string }) => `Echo: ${message}`,
      });

      let capturedToolCall: { toolName: string; input: unknown } | null = null;

      const result = streamText({
        model: 'zai/glm-5',
        system: 'You have a test tool. Use it when asked.',
        messages: [{ role: 'user', content: 'Call the test_tool with message "hello world"' }],
        tools: { test_tool: testTool },
        onStepFinish: (step) => {
          if (step.toolCalls && step.toolCalls.length > 0) {
            capturedToolCall = {
              toolName: step.toolCalls[0].toolName,
              input: step.toolCalls[0].input,
            };
          }
        },
      });

      await result.consumeStream();
      await result.text;

      expect(capturedToolCall).not.toBeNull();
      expect(capturedToolCall!.toolName).toBe('test_tool');
      expect(capturedToolCall!.input).toHaveProperty('message');
      expect((capturedToolCall!.input as { message: string }).message.toLowerCase()).toContain('hello');

      console.log('Tool call input (SDK 6):', capturedToolCall);
    }, 30000);

    it('should verify args is undefined and input exists in SDK 6', async () => {
      const testTool = tool({
        description: 'Add two numbers',
        inputSchema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        execute: async ({ a, b }: { a: number; b: number }) => `${a + b}`,
      });

      let toolCallWithArgs: unknown = null;
      let toolCallWithInput: unknown = null;

      const result = streamText({
        model: 'zai/glm-5',
        system: 'Use the add tool when asked to add numbers.',
        messages: [{ role: 'user', content: 'What is 5 plus 3? Use the add tool.' }],
        tools: { add: testTool },
        onStepFinish: (step) => {
          if (step.toolCalls && step.toolCalls.length > 0) {
            const call = step.toolCalls[0] as any;
            toolCallWithArgs = call.args;
            toolCallWithInput = call.input;
          }
        },
      });

      await result.consumeStream();
      await result.text;

      expect(toolCallWithArgs).toBeUndefined();
      expect(toolCallWithInput).toBeDefined();
      expect(toolCallWithInput).toHaveProperty('a');
      expect(toolCallWithInput).toHaveProperty('b');

      console.log('args (should be undefined):', toolCallWithArgs);
      console.log('input (should exist):', toolCallWithInput);
    }, 30000);
  });

  describe('Real API Integration Tests via AI Gateway', () => {
    const gatewayTestCases = [
      {
        name: 'GLM-5 via AI Gateway',
        modelId: 'zai/glm-5',
        systemPrompt: 'You are a helpful AI assistant.',
        userMessage: 'Hello! Please respond with just "GLM-5 working" to confirm connection.',
      },
      {
        name: 'GPT-5 via AI Gateway', 
        modelId: 'openai/gpt-5',
        systemPrompt: 'You are a helpful AI assistant.',
        userMessage: 'Hello! Please respond with just "GPT-5 working" to confirm connection.',
      },
      {
        name: 'Claude via AI Gateway',
        modelId: 'anthropic/claude-sonnet-4-5-20250929',
        systemPrompt: 'You are a helpful AI assistant.', 
        userMessage: 'Hello! Please respond with just "Claude working" to confirm connection.',
      },
    ];

    gatewayTestCases.forEach(({ name, modelId, systemPrompt, userMessage }) => {
      it(`${name} should respond to API call`, async () => {
        // Set API key as environment variable for AI Gateway
      // AI Gateway expects AI_GATEWAY_API_KEY (not VITE_AI_GATEWAY_KEY)
        try {
          // AI Gateway in SDK 6 uses model strings directly with unified auth
          const result = await streamText({
            model: modelId, // Just model string, no createModel needed
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          });

          const text = await result.text;
          expect(text).toBeTruthy();
          expect(text.length).toBeGreaterThan(0);
          console.log(`${name} response:`, text);
        } catch (error) {
          console.error(`${name} error:`, error);
          throw error;
        }
      }, 30000); // 30s timeout
    });
  });
});