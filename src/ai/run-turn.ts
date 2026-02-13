import { streamText, tool } from 'ai';
import type { ToolSet, ModelMessage } from 'ai';
import { z } from 'zod';
import type { GamePlugin } from '../core';
import type { ToolContext } from '../core/ai-tools';
import { wrapToolsWithContext } from '../core/ai-tools';
import { logStepFinish } from './logging';
import { resolveModel } from './providers';
import { AI_CONFIG, KEEP_LATEST_INFO_TOOL_NAMES, TERMINAL_TOOL_NAMES } from './constants';
import { startActiveObservation } from '@langfuse/tracing';

export interface StepState {
  blocked: boolean;
  blockReason?: string;
}

export interface RewindSignal {
  triggered: boolean;
  reason: string;
  guidance: string;
}

interface AgentConfig {
  model: string; // AI SDK v6+ accepts model strings directly
  systemPrompt: string;
  getState: () => string;
  tools: ToolSet;
  label: string;
  logging?: boolean;
  abort?: AbortController;
  checkpoint?: {
    snapshot: any;
    restore: (snapshot: any) => void;
  };
}

interface AgentResult {
  text: string;
  stepCount: number;
  aborted: boolean;
  rewindCount: number;
}

const KEEP_LATEST_SET = new Set<string>(KEEP_LATEST_INFO_TOOL_NAMES);
const TERMINAL_TOOLS = new Set<string>(TERMINAL_TOOL_NAMES);
const MAX_REWINDS = 2;
const MAX_STEPS = 1000;

function condenseToolResults(history: ModelMessage[], fromIndex: number): void {
  let lastInfoToolIndex = -1;
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type === 'tool-result' && KEEP_LATEST_SET.has(part.toolName)) {
          lastInfoToolIndex = i;
        }
      }
    }
  }

  for (let i = fromIndex; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type !== 'tool-result') continue;
        if (!KEEP_LATEST_SET.has(part.toolName)) continue;
        if (i === lastInfoToolIndex) continue;
        part.result = `[${part.toolName} — superseded by newer call]`;
      }
    }
  }
}

async function runAgent(config: AgentConfig): Promise<AgentResult> {
  return startActiveObservation(config.label, async (span) => {
    const { model, systemPrompt, getState, tools, label, logging, abort: configAbort, checkpoint } = config;
    const abort = configAbort ?? new AbortController();
    const stepState: StepState = { blocked: false };
    const rewindSignal: RewindSignal = { triggered: false, reason: '', guidance: '' };

    const wrappedTools = Object.keys(tools).length > 0
      ? wrapToolsWithContext(tools, {
          stepState,
          abort,
          rewindSignal,
          restoreCheckpoint: checkpoint ? () => checkpoint.restore(checkpoint.snapshot) : undefined,
          terminalTools: TERMINAL_TOOLS,
        })
      : undefined;

    const toolCount = Object.keys(tools).length;
    const toolNames = Object.keys(tools);
    let stepCount = 0;
    let lastText = '';
    let aborted = false;
    let rewindCount = 0;

    const history: ModelMessage[] = [];

    span.update({
      input: { systemPrompt: systemPrompt },
      metadata: { toolCount, toolNames },
    });

    if (logging) {
      console.group(`[AI: ${label}]`);
      console.log('%c[system]', 'color: #88f', systemPrompt.slice(0, 200) + '...');
    }

    for (let step = 0; step < MAX_STEPS; step++) {
      stepState.blocked = false;
      stepState.blockReason = undefined;

      const freshState = getState();
      const messagesWithState: ModelMessage[] = [
        ...history,
        { role: 'user' as const, content: `[CURRENT GAME STATE]\n${freshState}` },
      ];

      const result = await startActiveObservation(`${label}/step-${step}`, async (gen) => {
        gen.update({
          input: { systemPrompt: systemPrompt, messages: messagesWithState },
        });

        const stream = streamText({
          model: resolveModel(model),
          maxOutputTokens: AI_CONFIG.MAX_TOKENS,
          maxRetries: 0,
          system: systemPrompt,
          tools: wrappedTools,
          messages: messagesWithState,
          onStepFinish: (s: any) => {
            if (logging) logStepFinish(s);
          },
        });

        await stream.consumeStream();

        const res = {
          text: await stream.text,
          reasoning: await stream.reasoning,
          toolCalls: await stream.toolCalls,
          response: await stream.response,
          usage: await stream.usage,
        };

        gen.update({
          output: {
            text: res.text,
            reasoning: res.reasoning,
            toolCalls: res.toolCalls,
            responseMessages: res.response.messages,
          },
          usageDetails: {
            input: res.usage?.inputTokens ?? 0,
            output: res.usage?.outputTokens ?? 0,
            total: res.usage?.totalTokens ?? 0,
          },
        });

        return res;
      }, { asType: 'generation' });

      stepCount++;
      lastText = result.text || lastText;

      if (rewindSignal.triggered) {
        rewindCount++;
        if (logging) {
          console.log(`%c[${label}] REWIND #${rewindCount}: ${rewindSignal.reason}`, 'color: #f44');
        }

        if (rewindCount > MAX_REWINDS) {
          if (logging) {
            console.log(`%c[${label}] Max rewinds (${MAX_REWINDS}) exceeded, continuing`, 'color: #f80');
          }
          const prevLen = history.length;
          for (const msg of result.response.messages) {
            history.push(msg as ModelMessage);
          }
          condenseToolResults(history, prevLen);
          history.push({
            role: 'user' as const,
            content: `[REWIND DENIED] Maximum rewind limit (${MAX_REWINDS}) reached. You must continue with the current game state. Guidance: ${rewindSignal.guidance}`,
          });
        } else {
          history.length = 0;
          history.push({
            role: 'user' as const,
            content: `[REWIND APPLIED] Your previous actions have been undone. Reason: ${rewindSignal.reason}\n\nGuidance for this attempt: ${rewindSignal.guidance}`,
          });
        }

        rewindSignal.triggered = false;
        rewindSignal.reason = '';
        rewindSignal.guidance = '';
        continue;
      }

      const prevLen = history.length;
      for (const msg of result.response.messages) {
        history.push(msg as ModelMessage);
      }
      condenseToolResults(history, prevLen);

      if (abort.signal.aborted) {
        aborted = true;
        break;
      }

      if (!result.toolCalls || result.toolCalls.length === 0) {
        if (logging) console.log(`%c[${label}] step ${step}: no tool calls, task complete`, 'color: #f80');
        break;
      }
    }

    if (logging) console.groupEnd();
    span.update({ output: { stepCount, aborted, rewindCount, finalHistory: history } });
    return { text: lastText, stepCount, aborted, rewindCount };
  }, { asType: 'span' });
}

function createLaunchSubagentTool(opts: {
  executorModel: string; // AI SDK v6+ accepts model strings directly
  executorSystemPrompt: string;
  executorTools: ToolSet;
  getState: () => string;
  plannerAbort: AbortController;
  logging?: boolean;
  deckStrategy?: string;
}): ToolSet[string] {
  return tool({
    description: 'Launch an executor subagent to perform a specific task. Provide clear, concrete instructions with card names and zones.',
    inputSchema: z.object({
      instructions: z.string().describe('Clear, concrete instructions for the executor'),
    }),
    async execute({ instructions }) {
      const { executorModel, executorSystemPrompt, executorTools, getState, plannerAbort, logging } = opts;

      const fullPrompt = `${executorSystemPrompt}\n\n## TASK INSTRUCTIONS\n${instructions}`;

      const result = await runAgent({
        model: executorModel,
        systemPrompt: fullPrompt,
        getState,
        tools: executorTools,
        label: 'Executor',
        logging,
        abort: plannerAbort,
      });
      return `Subagent completed. Steps used: ${result.stepCount}. Summary: ${result.text || 'Task finished'}`;
    },
  });
}

export interface AIConfig {
  context: ToolContext;
  plugin: GamePlugin;
  model: string; // AI SDK v6+ accepts model strings directly
  plannerModel: string; // AI SDK v6+ accepts model strings directly
  aiMode: 'autonomous' | 'pipeline';
  deckStrategy?: string;
  logging?: boolean;
}

function resolveMode(ctx: ToolContext): 'setup' | 'startOfTurn' | 'main' | 'decision' {
  if (ctx.isDecisionResponse) return 'decision';
  if (ctx.getState().phase === 'setup') return 'setup';
  return 'main';
}

export async function runAutonomousTurn(config: AIConfig): Promise<void> {
  const { context: ctx, plugin, model, plannerModel, deckStrategy } = config;

  await startActiveObservation('ai-autonomous', async () => {
    const withStrategy = (prompt: string) =>
      deckStrategy ? prompt + '\n\n## YOUR DECK STRATEGY\n' + deckStrategy : prompt;

    const mode = resolveMode(ctx);
    const isNormalTurn = mode === 'main';
    console.log(mode);

    if (isNormalTurn) {
      const skip = await plugin.shouldSkipStartOfTurn?.(ctx) ?? false;

      if (!skip) {
        const { prompt, tools } = plugin.getAgentConfig!(ctx, 'startOfTurn');
        await runAgent({
          model,
          systemPrompt: withStrategy(prompt),
          getState: () => ctx.getReadableState(),
          tools,
          label: 'StartOfTurn',
          logging: config.logging,
        });
      }

      if (config.aiMode === 'pipeline') {
        const { prompt: execPrompt, tools: execTools } = plugin.getAgentConfig!(ctx, 'executor');
        const { prompt: planPrompt } = plugin.getAgentConfig!(ctx, 'planner');
        const plannerAbort = new AbortController();
        const launchTool = createLaunchSubagentTool({
          executorModel: model,
          executorSystemPrompt: execPrompt,
          executorTools: execTools,
          getState: () => ctx.getReadableState(),
          plannerAbort,
          logging: config.logging,
          deckStrategy,
        });
        await runAgent({
          model: plannerModel,
          systemPrompt: withStrategy(planPrompt),
          getState: () => ctx.getReadableState(),
          tools: { launch_subagent: launchTool },
          label: 'Planner',
          logging: config.logging,
          abort: plannerAbort,
        });
      } else {
        const { prompt, tools } = plugin.getAgentConfig!(ctx, 'main');
        const mainCheckpoint = ctx.createCheckpoint && ctx.restoreState
          ? { snapshot: ctx.createCheckpoint(), restore: ctx.restoreState }
          : undefined;
        await runAgent({
          model,
          systemPrompt: withStrategy(prompt),
          getState: () => ctx.getReadableState(),
          tools,
          label: 'Main',
          logging: config.logging,
          checkpoint: mainCheckpoint,
        });
      }
    } else if (mode === 'decision') {
      const { prompt, tools } = plugin.getAgentConfig!(ctx, 'decision');
      const decisionCheckpoint = ctx.createCheckpoint && ctx.restoreState
        ? { snapshot: ctx.createCheckpoint(), restore: ctx.restoreState }
        : undefined;
      await runAgent({
        model,
        systemPrompt: withStrategy(prompt),
        getState: () => ctx.getReadableState(),
        tools,
        label: 'Decision',
        logging: config.logging,
        checkpoint: decisionCheckpoint,
      });
    } else {
      const { prompt, tools } = plugin.getAgentConfig!(ctx, mode);
      await runAgent({
        model,
        systemPrompt: withStrategy(prompt),
        getState: () => ctx.getReadableState(),
        tools,
        label: 'Setup',
        logging: config.logging,
      });
    }
  }, { asType: 'agent' });
}
