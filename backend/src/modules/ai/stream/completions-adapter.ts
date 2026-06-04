import { EventType } from '@ag-ui/core';
import {
  convertSchemaToJsonSchema,
  type JSONSchema,
  type ModelMessage,
  normalizeSystemPrompts,
  type StreamChunk,
  type SystemPrompt,
  type TextOptions,
  type Tool,
} from '@tanstack/ai';
import { BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult } from '@tanstack/ai/adapters';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Minimal TanStack AI adapter for OpenAI-compatible Chat Completions endpoints.
 * Use this instead of @tanstack/ai-openai which targets the newer Responses API.
 */
export class CompletionsAdapter extends BaseTextAdapter<
  string,
  Record<string, unknown>,
  readonly ['text'],
  {
    text: Record<string, never>;
    image: Record<string, never>;
    audio: Record<string, never>;
    video: Record<string, never>;
    document: Record<string, never>;
  }
> {
  readonly name = 'completions';
  private client: OpenAI;

  constructor(client: OpenAI, model: string) {
    super({}, model);
    this.client = client;
  }

  async *chatStream(options: TextOptions<Record<string, unknown>>): AsyncIterable<StreamChunk> {
    const runId = this.generateId();
    const messageId = this.generateId();
    const toolCalls = new Map<number, { id: string; name: string; args: string; started: boolean }>();
    let emittedTextStart = false;
    let model = options.model;

    yield { type: EventType.RUN_STARTED, threadId: options.threadId ?? runId, runId, model, timestamp: Date.now() };

    try {
      const stream = await this.client.chat.completions.create({
        model: options.model,
        messages: toMessages(options.messages, options.systemPrompts),
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature,
        top_p: options.topP,
        max_completion_tokens: options.maxTokens,
        tools: toTools(options.tools),
      });

      for await (const chunk of stream) {
        model = chunk.model ?? model;
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Text content
        if (choice.delta.content) {
          if (!emittedTextStart) {
            emittedTextStart = true;
            yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', model, timestamp: Date.now() };
          }
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: choice.delta.content,
            model,
            timestamp: Date.now(),
          };
        }

        // Tool calls
        for (const tc of choice.delta.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          const state = toolCalls.get(idx) ?? {
            id: tc.id ?? this.generateId(),
            name: tc.function?.name ?? '',
            args: '',
            started: false,
          };
          if (tc.id) state.id = tc.id;
          if (tc.function?.name) state.name = tc.function.name;

          if (!state.started) {
            state.started = true;
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: state.id,
              toolCallName: state.name,
              toolName: state.name,
              index: idx,
              model,
              timestamp: Date.now(),
            };
          }
          if (tc.function?.arguments) {
            state.args += tc.function.arguments;
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: state.id,
              delta: tc.function.arguments,
              args: state.args,
              model,
              timestamp: Date.now(),
            };
          }
          toolCalls.set(idx, state);
        }
      }

      // Close open tool calls
      for (const [, state] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
        if (!state.started) continue;
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId: state.id,
          toolName: state.name,
          input: safeParse(state.args),
          model,
          timestamp: Date.now(),
        };
      }

      if (emittedTextStart) {
        yield { type: EventType.TEXT_MESSAGE_END, messageId, model, timestamp: Date.now() };
      }

      yield {
        type: EventType.RUN_FINISHED,
        threadId: options.threadId ?? runId,
        runId,
        model,
        finishReason: toolCalls.size > 0 ? 'tool_calls' : 'stop',
        timestamp: Date.now(),
      };
    } catch (error) {
      yield {
        type: EventType.RUN_ERROR,
        message: error instanceof Error ? error.message : String(error),
        runId,
        model,
        timestamp: Date.now(),
      };
    }
  }

  async structuredOutput(
    _options: StructuredOutputOptions<Record<string, unknown>>,
  ): Promise<StructuredOutputResult<unknown>> {
    throw new Error('structuredOutput is not implemented for CompletionsAdapter');
  }
}

// -- Helpers --

function toMessages(messages: ModelMessage[], systemPrompts?: SystemPrompt[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const s of normalizeSystemPrompts(systemPrompts)) out.push({ role: 'system', content: s.content });

  for (const m of messages) {
    const text = textOf(m.content);
    if (m.role === 'tool') {
      if (m.toolCallId) out.push({ role: 'tool', tool_call_id: m.toolCallId, content: text });
    } else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: text || null,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
    } else {
      out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function toTools(tools?: Tool[]): ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => {
    const schema: JSONSchema = (t.inputSchema ? convertSchemaToJsonSchema(t.inputSchema) : undefined) ?? {
      type: 'object',
      properties: {},
      required: [],
    };
    if (schema.type === 'object' && schema.additionalProperties === undefined) schema.additionalProperties = false;
    return { type: 'function', function: { name: t.name, description: t.description, parameters: schema } };
  });
}

function textOf(content: ModelMessage['content']): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text')
    .map((p) => p.content)
    .join('');
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s || {};
  }
}
