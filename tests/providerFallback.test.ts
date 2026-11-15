import { describe, expect, it } from 'vitest';
import {
  CircuitBreaker,
  ProviderFallbackChain,
  type LLMProvider,
  type NormalizedChatRequest,
} from '../packages/server/src/llm/providerChain.ts';
import { loadConfig } from '../packages/server/src/config.ts';

class MockTestProvider implements LLMProvider {
  readonly supports = { tools: true, vision: true };
  readonly breaker: CircuitBreaker;
  public callCount = 0;

  constructor(
    public readonly name: 'openrouter' | 'gemini' | 'groq',
    public behavior: {
      shouldFail?: boolean;
      failureType?: '429' | 'timeout' | 'midstream_error';
      streamTokens?: string[];
      ttftDelayMs?: number;
    } = {}
  ) {
    this.breaker = new CircuitBreaker(name, 3, 1000); // 1s cooldown for fast testing
  }

  isConfigured(): boolean {
    return true;
  }

  getModelName(): string {
    return `mock-${this.name}`;
  }

  async chatStream(
    _req: NormalizedChatRequest,
    opts: {
      signal?: AbortSignal;
      onDelta: (token: string) => void;
      firstTokenTimeoutMs?: number;
      totalTimeoutMs?: number;
    }
  ): Promise<{ fullText: string; modelUsed: string; ttftMs: number; totalMs: number }> {
    this.callCount += 1;

    if (this.behavior.shouldFail) {
      if (this.behavior.failureType === '429') {
        this.breaker.recordFailure('HTTP 429 Rate Limited');
        throw new Error('HTTP 429 Rate Limited');
      }
      if (this.behavior.failureType === 'timeout') {
        const timeoutMs = opts.firstTokenTimeoutMs || 8000;
        await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 50)));
        this.breaker.recordFailure('Time to first token exceeded');
        throw new Error('Time to first token exceeded');
      }
      if (this.behavior.failureType === 'midstream_error') {
        // Emit 2 tokens then throw midstream
        opts.onDelta('Part1 ');
        opts.onDelta('Part2 ');
        this.breaker.recordFailure('Connection terminated abruptly mid-stream');
        throw new Error('Connection terminated abruptly mid-stream');
      }
      this.breaker.recordFailure('Generic provider error');
      throw new Error('Generic provider error');
    }

    const tokens = this.behavior.streamTokens || ['Hello', ' from ', this.name];
    let fullText = '';
    for (const t of tokens) {
      fullText += t;
      opts.onDelta(t);
    }
    this.breaker.recordSuccess(25);
    return {
      fullText,
      modelUsed: `mock:${this.name}`,
      ttftMs: 20,
      totalMs: 40,
    };
  }
}

describe('Strict Sequential Provider Fallback Chain (Master Prompt Section 8, Tests 12–17)', () => {
  const cfg = loadConfig();

  it('Test 12: Provider order: OpenRouter is attempted first and Gemini is not called on success', async () => {
    const chain = new ProviderFallbackChain(cfg);
    const mockOpenRouter = new MockTestProvider('openrouter');
    const mockGemini = new MockTestProvider('gemini');

    // Replace internal providers with test mocks
    (chain as unknown as { providers: LLMProvider[] }).providers = [mockOpenRouter, mockGemini];

    const deltas: string[] = [];
    const res = await chain.streamChat(
      { modelType: 'fast', messages: [{ role: 'user', content: 'test' }] },
      { onDelta: (d) => deltas.push(d) }
    );

    expect(mockOpenRouter.callCount).toBe(1);
    expect(mockGemini.callCount).toBe(0);
    expect(res.provider).toBe('openrouter');
    expect(deltas.join('')).toContain('openrouter');
  });

  it('Test 13: Fallback on 429: When OpenRouter returns 429, Gemini is called immediately', async () => {
    const chain = new ProviderFallbackChain(cfg);
    const mockOpenRouter = new MockTestProvider('openrouter', {
      shouldFail: true,
      failureType: '429',
    });
    const mockGemini = new MockTestProvider('gemini');

    (chain as unknown as { providers: LLMProvider[] }).providers = [mockOpenRouter, mockGemini];

    const deltas: string[] = [];
    const res = await chain.streamChat(
      { modelType: 'fast', messages: [{ role: 'user', content: 'test' }] },
      { onDelta: (d) => deltas.push(d) }
    );

    expect(mockOpenRouter.callCount).toBe(1);
    expect(mockGemini.callCount).toBe(1);
    expect(res.provider).toBe('gemini');
    expect(deltas.join('')).toContain('gemini');
  });

  it('Test 14: Fallback on timeout: OpenRouter timing out triggers fallback to Gemini', async () => {
    const chain = new ProviderFallbackChain(cfg);
    const mockOpenRouter = new MockTestProvider('openrouter', {
      shouldFail: true,
      failureType: 'timeout',
    });
    const mockGemini = new MockTestProvider('gemini');

    (chain as unknown as { providers: LLMProvider[] }).providers = [mockOpenRouter, mockGemini];

    const res = await chain.streamChat(
      { modelType: 'fast', messages: [{ role: 'user', content: 'test' }] },
      { onDelta: () => {} }
    );

    expect(mockOpenRouter.callCount).toBe(1);
    expect(mockGemini.callCount).toBe(1);
    expect(res.provider).toBe('gemini');
  });

  it('Test 15: Circuit breaker: 3 failures trip OpenRouter to OPEN, skipping it on 4th attempt', async () => {
    const chain = new ProviderFallbackChain(cfg);
    const mockOpenRouter = new MockTestProvider('openrouter', {
      shouldFail: true,
      failureType: '429',
    });
    const mockGemini = new MockTestProvider('gemini');

    (chain as unknown as { providers: LLMProvider[] }).providers = [mockOpenRouter, mockGemini];

    // 3 failed requests
    for (let i = 0; i < 3; i += 1) {
      await chain.streamChat(
        { modelType: 'fast', messages: [{ role: 'user', content: 'test' }] },
        { onDelta: () => {} }
      );
    }

    expect(mockOpenRouter.callCount).toBe(3);
    expect(mockOpenRouter.breaker.getStatus().circuitState).toBe('open');

    // 4th request: should immediately skip OpenRouter
    const res4 = await chain.streamChat(
      { modelType: 'fast', messages: [{ role: 'user', content: 'test' }] },
      { onDelta: () => {} }
    );

    expect(mockOpenRouter.callCount).toBe(3); // Not incremented!
    expect(mockGemini.callCount).toBe(4);
    expect(res4.provider).toBe('gemini');

    // Wait 1.1s for cooldown to transition to half_open
    await new Promise((r) => setTimeout(r, 1100));
    expect(mockOpenRouter.breaker.canAttempt()).toBe(true);
    expect(mockOpenRouter.breaker.getStatus().circuitState).toBe('half_open');
  });

  it('Test 16: Mid-stream failure: Stream emits tokens then fails -> triggers stream_reset event before next provider', async () => {
    const chain = new ProviderFallbackChain(cfg);
    const mockOpenRouter = new MockTestProvider('openrouter', {
      shouldFail: true,
      failureType: 'midstream_error',
    });
    const mockGemini = new MockTestProvider('gemini', {
      streamTokens: ['Clean ', 'restarted ', 'answer'],
    });

    (chain as unknown as { providers: LLMProvider[] }).providers = [mockOpenRouter, mockGemini];

    let resetFired = false;
    let tokens: string[] = [];

    const res = await chain.streamChat(
      { modelType: 'fast', messages: [{ role: 'user', content: 'test' }] },
      {
        onDelta: (t) => tokens.push(t),
        onStreamReset: () => {
          resetFired = true;
          tokens = []; // Widget clears partial output
        },
      }
    );

    expect(resetFired).toBe(true);
    expect(tokens.join('')).toBe('Clean restarted answer');
    expect(res.provider).toBe('gemini');
  });

  it('Test 17: TTFT under budget: fast response delivers first token in < 1.5s', async () => {
    const chain = new ProviderFallbackChain(cfg);
    const mockOpenRouter = new MockTestProvider('openrouter');
    (chain as unknown as { providers: LLMProvider[] }).providers = [mockOpenRouter];

    const start = Date.now();
    let ttft = 0;
    await chain.streamChat(
      { modelType: 'fast', messages: [{ role: 'user', content: 'hi' }] },
      {
        onDelta: () => {
          if (!ttft) ttft = Date.now() - start;
        },
      }
    );

    expect(ttft).toBeLessThan(1500);
  });
});
