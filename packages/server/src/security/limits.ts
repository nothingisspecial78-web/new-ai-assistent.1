import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import type { SourceCitation } from '@ai-assistant/core';
import type { ServerConfig } from '../config.ts';

export function createIpRateLimiter(cfg: ServerConfig) {
  return rateLimit({
    windowMs: cfg.rateLimitWindowMs,
    max: cfg.rateLimitMaxIp,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP address. Please retry shortly.' },
  });
}

export function createUserRateLimiter(cfg: ServerConfig) {
  return rateLimit({
    windowMs: cfg.rateLimitWindowMs,
    max: cfg.rateLimitMaxUser,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const user = (req as Request & { authUser?: { userId: string } }).authUser;
      return user?.userId ? `user:${user.userId}` : `ip:${ipKeyGenerator(req.ip || '127.0.0.1')}`;
    },
    message: { error: 'User rate limit exceeded. Please pause briefly before sending more requests.' },
  });
}

export interface CachedAnswer {
  answer: string;
  sources: SourceCitation[];
  refusal: boolean;
  model: string;
  expiresAt: number;
}

export class ResponseCache {
  private readonly store = new Map<string, CachedAnswer>();

  constructor(private readonly ttlMs: number) {}

  makeKey(
    appId: string,
    question: string,
    language: string,
    routePath?: string,
    contextKey?: string
  ): string {
    const normalized = question.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${appId}::${language}::${routePath || ''}::${contextKey || ''}::${normalized}`;
  }

  get(key: string): CachedAnswer | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  set(key: string, value: Omit<CachedAnswer, 'expiresAt'>): void {
    if (this.ttlMs <= 0) return;
    if (this.store.size > 500) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      ...value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clearForApp(appId: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(`${appId}::`)) {
        this.store.delete(key);
      }
    }
  }
}
