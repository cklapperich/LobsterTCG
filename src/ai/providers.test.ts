// Load environment variables from .env file
import { config } from 'dotenv';
config();

import { describe, it, expect } from 'vitest';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { MODEL_OPTIONS, DEFAULT_PLANNER, getModelOptionByLabel } from './providers';

describe('Simplified AI Providers', () => {
  it('Environment variables should be loaded', () => {
    const apiKey = process.env.VITE_AI_GATEWAY_KEY;
    console.log('VITE_AI_GATEWAY_KEY loaded:', apiKey ? `${apiKey.slice(0, 10)}...` : 'NOT FOUND');
    expect(apiKey).toBeDefined(); // Should be defined from .env file
  });
  it('MODEL_OPTIONS should have 3 models', () => {
    expect(MODEL_OPTIONS).toHaveLength(3);
    expect(MODEL_OPTIONS.map(m => m.label)).toContain('GLM-5');
    expect(MODEL_OPTIONS.map(m => m.label)).toContain('Kimi K2.5');
    expect(MODEL_OPTIONS.map(m => m.label)).toContain('Claude Sonnet 4.5');
  });

  it('Should have correct model IDs', () => {
    const glm5 = MODEL_OPTIONS.find(m => m.label === 'GLM-5');
    expect(glm5?.modelId).toBe('zai/glm-5');

    const kimi = MODEL_OPTIONS.find(m => m.label === 'Kimi K2.5');
    expect(kimi?.modelId).toBe('moonshotai/kimi-k2.5');

    const claude = MODEL_OPTIONS.find(m => m.label === 'Claude Sonnet 4.5');
    expect(claude?.modelId).toBe('anthropic/claude-sonnet-4-5-20250929');
  });

  it('DEFAULT_PLANNER should be GLM-5', () => {
    expect(DEFAULT_PLANNER.label).toBe('GLM-5');
    expect(DEFAULT_PLANNER.modelId).toBe('zai/glm-5');
  });

  it('getModelOptionByLabel should find models', () => {
    const glm5 = getModelOptionByLabel('GLM-5');
    expect(glm5).toBeDefined();
    expect(glm5?.modelId).toBe('zai/glm-5');

    const notFound = getModelOptionByLabel('Non-existent Model');
    expect(notFound).toBeUndefined();
  });

  it('Model IDs should be valid strings for AI SDK', () => {
    // AI SDK v6+ accepts model strings directly
    MODEL_OPTIONS.forEach(option => {
      expect(option.modelId).toBeTruthy();
      expect(typeof option.modelId).toBe('string');
      expect(option.modelId).toContain('/'); // Should have provider prefix
    });
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
    const testCases = [
      {
        name: 'GLM-5 via AI Gateway',
        modelId: 'zai/glm-5',
        systemPrompt: 'You are a helpful AI assistant.',
        userMessage: 'Hello! Please respond with just "GLM-5 working" to confirm connection.',
      },
      {
        name: 'Kimi K2.5 via AI Gateway',
        modelId: 'moonshotai/kimi-k2.5',
        systemPrompt: 'You are a helpful AI assistant.',
        userMessage: 'Hello! Please respond with just "Kimi working" to confirm connection.',
      },
      {
        name: 'Claude Sonnet 4.5 via AI Gateway',
        modelId: 'anthropic/claude-sonnet-4-5-20250929',
        systemPrompt: 'You are a helpful AI assistant.',
        userMessage: 'Hello! Please respond with just "Claude working" to confirm connection.',
      },
    ];

    testCases.forEach(({ name, modelId, systemPrompt, userMessage }) => {
      it(`${name} should respond to API call`, async () => {
        try {
          const result = await streamText({
            model: modelId,
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
