import OpenAI from 'openai';
import { logger, type ServerConfig } from '../config.ts';
import type { LlmChatMessage, LlmCompletionResult, OpenAiToolSpec } from './client.ts';

export interface NormalizedChatRequest {
  modelType: 'fast' | 'strong' | 'vision';
  messages: LlmChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface NormalizedToolRequest extends NormalizedChatRequest {
  tools: OpenAiToolSpec[];
}

export interface ProviderDebugStatus {
  name: 'openrouter' | 'gemini' | 'groq';
  circuitState: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureReason?: string;
  lastFailureTime?: string;
  lastLatencyMs?: number;
  configured: boolean;
  modelFast: string;
  modelStrong: string;
}

export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private lastFailureReason?: string;
  private lastLatencyMs?: number;

  constructor(
    public readonly name: string,
    private readonly threshold = 3,
    private readonly cooldownMs = 60000
  ) {}

  canAttempt(): boolean {
    const now = Date.now();
    if (this.state === 'open') {
      if (now - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(latencyMs: number): void {
    this.failureCount = 0;
    this.state = 'closed';
    this.lastLatencyMs = latencyMs;
  }

  recordFailure(reason: string): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    this.lastFailureReason = reason;
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      logger.warn(
        { provider: this.name, failures: this.failureCount, reason },
        `Circuit breaker OPEN for provider "${this.name}" (cooling down for ${this.cooldownMs / 1000}s)`
      );
    }
  }

  getStatus(): {
    circuitState: 'closed' | 'open' | 'half_open';
    failureCount: number;
    lastFailureReason?: string;
    lastFailureTime?: string;
    lastLatencyMs?: number;
  } {
    // If open but cooldown elapsed, report as half_open
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.cooldownMs) {
      return {
        circuitState: 'half_open',
        failureCount: this.failureCount,
        lastFailureReason: this.lastFailureReason,
        lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : undefined,
        lastLatencyMs: this.lastLatencyMs,
      };
    }
    return {
      circuitState: this.state,
      failureCount: this.failureCount,
      lastFailureReason: this.lastFailureReason,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : undefined,
      lastLatencyMs: this.lastLatencyMs,
    };
  }
}

export interface LLMProvider {
  readonly name: 'openrouter' | 'gemini' | 'groq';
  readonly supports: { tools: boolean; vision: boolean };
  readonly breaker: CircuitBreaker;
  isConfigured(): boolean;
  getModelName(type: 'fast' | 'strong' | 'vision'): string;
  chatStream(
    req: NormalizedChatRequest,
    opts: {
      signal?: AbortSignal;
      onDelta: (token: string) => void;
      firstTokenTimeoutMs?: number;
      totalTimeoutMs?: number;
    }
  ): Promise<{ fullText: string; modelUsed: string; ttftMs: number; totalMs: number }>;
  completeWithTools?(
    req: NormalizedToolRequest,
    opts: { signal?: AbortSignal; totalTimeoutMs?: number }
  ): Promise<LlmCompletionResult>;
}

function hasImages(messages: LlmChatMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')
  );
}

// 1. OpenRouter Provider
export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter' as const;
  readonly supports = { tools: true, vision: true };
  readonly breaker = new CircuitBreaker('openrouter', 3, 60000);
  private client: OpenAI | null = null;

  constructor(private readonly cfg: ServerConfig) {
    if (cfg.openRouterApiKey) {
      this.client = new OpenAI({
        apiKey: cfg.openRouterApiKey,
        baseURL: cfg.llmBaseUrl || 'https://openrouter.ai/api/v1',
        timeout: 45000,
        defaultHeaders: { 'X-Title': 'Khazna AI Assistant' },
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.openRouterApiKey && this.client);
  }

  getModelName(type: 'fast' | 'strong' | 'vision'): string {
    if (type === 'vision') {
      return process.env.OPENROUTER_MODEL_VISION || 'openai/gpt-4o-mini';
    }
    if (type === 'strong') {
      return process.env.OPENROUTER_MODEL_STRONG || 'openai/gpt-4o-mini';
    }
    return process.env.OPENROUTER_MODEL_FAST || 'openai/gpt-4o-mini';
  }

  async chatStream(
    req: NormalizedChatRequest,
    opts: {
      signal?: AbortSignal;
      onDelta: (token: string) => void;
      firstTokenTimeoutMs?: number;
      totalTimeoutMs?: number;
    }
  ): Promise<{ fullText: string; modelUsed: string; ttftMs: number; totalMs: number }> {
    if (!this.client) throw new Error('OpenRouter API key is not configured');
    const model = this.getModelName(req.modelType);
    const start = Date.now();
    let ttftMs = 0;
    let firstTokenReceived = false;

    const controller = new AbortController();
    const abortCombined = () => controller.abort();
    if (opts.signal) {
      opts.signal.addEventListener('abort', abortCombined);
    }

    const ttftTimeout = setTimeout(() => {
      if (!firstTokenReceived) {
        controller.abort(new Error(`OpenRouter time-to-first-token exceeded ${opts.firstTokenTimeoutMs || 8000}ms`));
      }
    }, opts.firstTokenTimeoutMs || 8000);

    const totalTimeout = setTimeout(() => {
      controller.abort(new Error(`OpenRouter total stream timeout exceeded ${opts.totalTimeoutMs || 45000}ms`));
    }, opts.totalTimeoutMs || 45000);

    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: req.messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          stream: true,
          temperature: req.temperature ?? 0.2,
          max_tokens: Math.min(req.maxTokens ?? 650, 700),
        },
        { signal: controller.signal }
      );

      let fullText = '';
      for await (const chunk of stream) {
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          ttftMs = Date.now() - start;
          clearTimeout(ttftTimeout);
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          opts.onDelta(delta);
        }
      }

      if (!fullText.trim()) {
        throw new Error('OpenRouter returned empty stream response');
      }

      const totalMs = Date.now() - start;
      this.breaker.recordSuccess(totalMs);
      return { fullText, modelUsed: `openrouter:${model}`, ttftMs: ttftMs || totalMs, totalMs };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure(errMsg);
      throw err;
    } finally {
      clearTimeout(ttftTimeout);
      clearTimeout(totalTimeout);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', abortCombined);
      }
    }
  }

  async completeWithTools(
    req: NormalizedToolRequest,
    opts: { signal?: AbortSignal; totalTimeoutMs?: number }
  ): Promise<LlmCompletionResult> {
    if (!this.client) throw new Error('OpenRouter API key is not configured');
    const model = this.getModelName(req.modelType);
    const start = Date.now();

    try {
      const res = await this.client.chat.completions.create(
        {
          model,
          messages: req.messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: req.tools as unknown as OpenAI.Chat.Completions.ChatCompletionTool[],
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: Math.min(req.maxTokens ?? 650, 700),
        },
        { signal: opts.signal }
      );

      const msg = res.choices?.[0]?.message;
      const content = msg?.content || '';
      const toolCalls = (msg?.tool_calls || [])
        .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
        }));

      const totalMs = Date.now() - start;
      this.breaker.recordSuccess(totalMs);
      return {
        content,
        toolCalls,
        modelUsed: `openrouter:${model}`,
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens,
              completionTokens: res.usage.completion_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure(errMsg);
      throw err;
    }
  }
}

// 2. Gemini Provider
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;
  readonly supports = { tools: true, vision: true };
  readonly breaker = new CircuitBreaker('gemini', 3, 60000);
  private client: OpenAI | null = null;

  constructor(private readonly cfg: ServerConfig) {
    if (cfg.geminiApiKey) {
      this.client = new OpenAI({
        apiKey: cfg.geminiApiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        timeout: 45000,
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.geminiApiKey && this.client);
  }

  getModelName(type: 'fast' | 'strong' | 'vision'): string {
    if (type === 'strong') {
      return process.env.GEMINI_MODEL_STRONG || 'gemini-2.5-flash';
    }
    return process.env.GEMINI_MODEL_FAST || 'gemini-2.5-flash';
  }

  async chatStream(
    req: NormalizedChatRequest,
    opts: {
      signal?: AbortSignal;
      onDelta: (token: string) => void;
      firstTokenTimeoutMs?: number;
      totalTimeoutMs?: number;
    }
  ): Promise<{ fullText: string; modelUsed: string; ttftMs: number; totalMs: number }> {
    if (!this.client) throw new Error('Gemini API key is not configured');
    const model = this.getModelName(req.modelType);
    const start = Date.now();
    let ttftMs = 0;
    let firstTokenReceived = false;

    const controller = new AbortController();
    const abortCombined = () => controller.abort();
    if (opts.signal) {
      opts.signal.addEventListener('abort', abortCombined);
    }

    const ttftTimeout = setTimeout(() => {
      if (!firstTokenReceived) {
        controller.abort(new Error(`Gemini time-to-first-token exceeded ${opts.firstTokenTimeoutMs || 8000}ms`));
      }
    }, opts.firstTokenTimeoutMs || 8000);

    const totalTimeout = setTimeout(() => {
      controller.abort(new Error(`Gemini total stream timeout exceeded ${opts.totalTimeoutMs || 45000}ms`));
    }, opts.totalTimeoutMs || 45000);

    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: req.messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          stream: true,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 1000,
        },
        { signal: controller.signal }
      );

      let fullText = '';
      for await (const chunk of stream) {
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          ttftMs = Date.now() - start;
          clearTimeout(ttftTimeout);
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          opts.onDelta(delta);
        }
      }

      if (!fullText.trim()) {
        throw new Error('Gemini returned empty stream response');
      }

      const totalMs = Date.now() - start;
      this.breaker.recordSuccess(totalMs);
      return { fullText, modelUsed: `gemini:${model}`, ttftMs: ttftMs || totalMs, totalMs };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure(errMsg);
      throw err;
    } finally {
      clearTimeout(ttftTimeout);
      clearTimeout(totalTimeout);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', abortCombined);
      }
    }
  }

  async completeWithTools(
    req: NormalizedToolRequest,
    opts: { signal?: AbortSignal; totalTimeoutMs?: number }
  ): Promise<LlmCompletionResult> {
    if (!this.client) throw new Error('Gemini API key is not configured');
    const model = this.getModelName(req.modelType);
    const start = Date.now();

    try {
      const res = await this.client.chat.completions.create(
        {
          model,
          messages: req.messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: req.tools as unknown as OpenAI.Chat.Completions.ChatCompletionTool[],
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: req.maxTokens ?? 1000,
        },
        { signal: opts.signal }
      );

      const msg = res.choices?.[0]?.message;
      const content = msg?.content || '';
      const toolCalls = (msg?.tool_calls || [])
        .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
        }));

      const totalMs = Date.now() - start;
      this.breaker.recordSuccess(totalMs);
      return {
        content,
        toolCalls,
        modelUsed: `gemini:${model}`,
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens,
              completionTokens: res.usage.completion_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure(errMsg);
      throw err;
    }
  }
}

// 3. Groq Provider
export class GroqProvider implements LLMProvider {
  readonly name = 'groq' as const;
  readonly supports = { tools: true, vision: false };
  readonly breaker = new CircuitBreaker('groq', 3, 60000);
  private client: OpenAI | null = null;

  constructor(private readonly cfg: ServerConfig) {
    if (cfg.groqApiKey) {
      this.client = new OpenAI({
        apiKey: cfg.groqApiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 45000,
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.groqApiKey && this.client);
  }

  getModelName(type: 'fast' | 'strong' | 'vision'): string {
    if (type === 'strong') {
      return process.env.GROQ_MODEL_STRONG || 'openai/gpt-oss-120b';
    }
    return process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b';
  }

  async chatStream(
    req: NormalizedChatRequest,
    opts: {
      signal?: AbortSignal;
      onDelta: (token: string) => void;
      firstTokenTimeoutMs?: number;
      totalTimeoutMs?: number;
    }
  ): Promise<{ fullText: string; modelUsed: string; ttftMs: number; totalMs: number }> {
    if (!this.client) throw new Error('Groq API key is not configured');
    const model = this.getModelName(req.modelType);
    const start = Date.now();
    let ttftMs = 0;
    let firstTokenReceived = false;

    const controller = new AbortController();
    const abortCombined = () => controller.abort();
    if (opts.signal) {
      opts.signal.addEventListener('abort', abortCombined);
    }

    const ttftTimeout = setTimeout(() => {
      if (!firstTokenReceived) {
        controller.abort(new Error(`Groq time-to-first-token exceeded ${opts.firstTokenTimeoutMs || 8000}ms`));
      }
    }, opts.firstTokenTimeoutMs || 8000);

    const totalTimeout = setTimeout(() => {
      controller.abort(new Error(`Groq total stream timeout exceeded ${opts.totalTimeoutMs || 45000}ms`));
    }, opts.totalTimeoutMs || 45000);

    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: req.messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          stream: true,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 1000,
        },
        { signal: controller.signal }
      );

      let fullText = '';
      for await (const chunk of stream) {
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          ttftMs = Date.now() - start;
          clearTimeout(ttftTimeout);
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          opts.onDelta(delta);
        }
      }

      if (!fullText.trim()) {
        throw new Error('Groq returned empty stream response');
      }

      const totalMs = Date.now() - start;
      this.breaker.recordSuccess(totalMs);
      return { fullText, modelUsed: `groq:${model}`, ttftMs: ttftMs || totalMs, totalMs };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure(errMsg);
      throw err;
    } finally {
      clearTimeout(ttftTimeout);
      clearTimeout(totalTimeout);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', abortCombined);
      }
    }
  }

  async completeWithTools(
    req: NormalizedToolRequest,
    opts: { signal?: AbortSignal; totalTimeoutMs?: number }
  ): Promise<LlmCompletionResult> {
    if (!this.client) throw new Error('Groq API key is not configured');
    const model = this.getModelName(req.modelType);
    const start = Date.now();

    try {
      const res = await this.client.chat.completions.create(
        {
          model,
          messages: req.messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: req.tools as unknown as OpenAI.Chat.Completions.ChatCompletionTool[],
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: req.maxTokens ?? 1000,
        },
        { signal: opts.signal }
      );

      const msg = res.choices?.[0]?.message;
      const content = msg?.content || '';
      const toolCalls = (msg?.tool_calls || [])
        .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
        }));

      const totalMs = Date.now() - start;
      this.breaker.recordSuccess(totalMs);
      return {
        content,
        toolCalls,
        modelUsed: `groq:${model}`,
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens,
              completionTokens: res.usage.completion_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.breaker.recordFailure(errMsg);
      throw err;
    }
  }
}

// Orchestrator: Strict Sequential Provider Fallback Chain
export class ProviderFallbackChain {
  private readonly providers: LLMProvider[];

  constructor(cfg: ServerConfig) {
    const openrouter = new OpenRouterProvider(cfg);
    const gemini = new GeminiProvider(cfg);
    const groq = new GroqProvider(cfg);

    const providerMap = {
      openrouter,
      gemini,
      groq,
    };

    // Default order: openrouter -> gemini -> groq
    const orderEnv = process.env.PROVIDER_ORDER || 'openrouter,gemini,groq';
    const parsedOrder = orderEnv
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is 'openrouter' | 'gemini' | 'groq' => s in providerMap);

    this.providers = parsedOrder.map((name) => providerMap[name]);
  }

  getProviders(): LLMProvider[] {
    return this.providers;
  }

  getDebugStatuses(): ProviderDebugStatus[] {
    return this.providers.map((p) => {
      const st = p.breaker.getStatus();
      return {
        name: p.name,
        circuitState: st.circuitState,
        failureCount: st.failureCount,
        lastFailureReason: st.lastFailureReason,
        lastFailureTime: st.lastFailureTime,
        lastLatencyMs: st.lastLatencyMs,
        configured: p.isConfigured(),
        modelFast: p.getModelName('fast'),
        modelStrong: p.getModelName('strong'),
      };
    });
  }

  async streamChat(
    req: NormalizedChatRequest,
    opts: {
      signal?: AbortSignal;
      onDelta: (token: string) => void;
      onStreamReset?: () => void;
    }
  ): Promise<{ fullText: string; modelUsed: string; provider: string; ttftMs: number; totalMs: number }> {
    const needsVision = hasImages(req.messages);
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      if (!provider.isConfigured()) {
        continue;
      }
      if (needsVision && !provider.supports.vision) {
        continue;
      }
      if (!provider.breaker.canAttempt()) {
        logger.warn({ provider: provider.name }, 'Skipping provider due to open circuit breaker');
        continue;
      }

      let emittedAny = false;
      const capturedDelta = (token: string) => {
        emittedAny = true;
        opts.onDelta(token);
      };

      try {
        const result = await provider.chatStream(
          { ...req, modelType: needsVision ? 'vision' : req.modelType },
          {
            signal: opts.signal,
            onDelta: capturedDelta,
            firstTokenTimeoutMs: Number(process.env.LLM_FIRST_TOKEN_TIMEOUT_MS || 8000),
            totalTimeoutMs: Number(process.env.LLM_TOTAL_TIMEOUT_MS || 45000),
          }
        );
        return { ...result, provider: provider.name };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ provider: provider.name, error: errMsg }, 'Provider attempt failed in chain');
        errors.push({ provider: provider.name, error: errMsg });

        // If tokens were already emitted to the user before failure, reset widget stream!
        if (emittedAny && opts.onStreamReset) {
          logger.info({ provider: provider.name }, 'Mid-stream failure; sending stream_reset before trying next provider');
          opts.onStreamReset();
        }
      }
    }

    throw new Error(
      `All configured providers in fallback chain failed: ${errors
        .map((e) => `[${e.provider}: ${e.error}]`)
        .join(', ')}`
    );
  }

  async completeWithTools(
    req: NormalizedToolRequest,
    opts: { signal?: AbortSignal }
  ): Promise<LlmCompletionResult & { provider: string }> {
    const needsVision = hasImages(req.messages);
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      if (!provider.isConfigured() || !provider.completeWithTools) {
        continue;
      }
      if (needsVision && !provider.supports.vision) {
        continue;
      }
      if (!provider.breaker.canAttempt()) {
        logger.warn({ provider: provider.name }, 'Skipping provider due to open circuit breaker');
        continue;
      }

      try {
        const res = await provider.completeWithTools(
          { ...req, modelType: 'strong' },
          { signal: opts.signal, totalTimeoutMs: Number(process.env.LLM_TOTAL_TIMEOUT_MS || 45000) }
        );
        return { ...res, provider: provider.name };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ provider: provider.name, error: errMsg }, 'Provider completeWithTools failed in chain');
        errors.push({ provider: provider.name, error: errMsg });
      }
    }

    throw new Error(
      `All configured providers failed completeWithTools: ${errors
        .map((e) => `[${e.provider}: ${e.error}]`)
        .join(', ')}`
    );
  }
}
