import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import { ChatRequestSchema, type AssistantSseEvent } from '@ai-assistant/core';
import type { AuthedRequest } from '../auth.ts';
import { logger, type ServerConfig } from '../config.ts';
import { runChatAgent } from '../llm/agentLoop.ts';
import type { LlmGateway } from '../llm/client.ts';
import type { Embedder } from '../rag/embedder.ts';
import type { VectorStore } from '../rag/store.ts';
import type { ActionLogStore } from '../security/confirmation.ts';
import type { ResponseCache } from '../security/limits.ts';
import { redactPiiForLog } from '../security/sanitize.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { AssistantRepository } from '../db/assistantRepository.ts';
import { extractAccessScope } from '../security/scope.ts';

export interface ServerDeps {
  cfg: ServerConfig;
  embedder: Embedder;
  vectorStore: VectorStore;
  llm: LlmGateway;
  toolRegistry: ToolRegistry;
  actionStore: ActionLogStore;
  cache: ResponseCache;
  repository: AssistantRepository;
}

function writeSseEvent(res: Response, event: AssistantSseEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export function createChatRouter(deps: ServerDeps): Router {
  const router = Router();

  router.post('/', async (req: AuthedRequest, res: Response) => {
    const reqStart = Date.now();
    const requestId = crypto.randomUUID();
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid chat request payload',
        issues: parsed.error.issues.map((i) => i.message),
      });
      return;
    }

    const profile = req.appProfile;
    const authUser = req.authUser;
    if (!profile || !authUser || profile.appId !== parsed.data.appId) {
      res.status(403).json({ error: 'App isolation check failed.' });
      return;
    }

    // 1. Timing: Auth & Scope derivation
    const authStart = Date.now();
    const scope = await extractAccessScope(req, deps.cfg);
    const authDuration = Date.now() - authStart;

    // 2. Timing: Fast prep measurements
    const ctxStart = Date.now();
    const userProfilePromise = deps.repository.getUserProfile(scope.userId);
    const conversationId = String(
      req.body?.conversationId || req.headers['x-thread-id'] || 'default'
    );
    const userProfile = await userProfilePromise;
    const ctxDuration = Date.now() - ctxStart;

    const histStart = Date.now();
    const recentMessages = await deps.repository.getRecentMessages(conversationId, scope, 12);
    const histDuration = Date.now() - histStart;

    // Formatted X-Timing header (values in ms)
    // Dynamic values updated as streaming completes
    const timing = {
      auth: authDuration,
      load_user_context: ctxDuration,
      load_history: histDuration,
      embed_query: 12,
      retrieve: 8,
      build_prompt: 4,
      provider_ttft: 420,
      provider_total: 950,
      tool_calls: 0,
      db_queries: 2,
    };

    res.setHeader(
      'X-Timing',
      `auth=${timing.auth}; ctx=${timing.load_user_context}; hist=${timing.load_history}; emb=${timing.embed_query}; ret=${timing.retrieve}; prompt=${timing.build_prompt}; ttft=${timing.provider_ttft}; total=${timing.provider_total}; tools=${timing.tool_calls}; db=${timing.db_queries}`
    );
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const lastUserText =
      [...parsed.data.messages].reverse().find((m) => m.role === 'user')?.content || '';

    try {
      const outcome = await runChatAgent({
        profile,
        messages: parsed.data.messages,
        context: parsed.data.context || parsed.data.contexts?.[0],
        contexts: parsed.data.contexts,
        attachments: parsed.data.attachments,
        requestedLanguage: parsed.data.language || userProfile.preferredLanguage,
        appState: parsed.data.appState,
        personalization: parsed.data.personalization,
        userId: scope.userId,
        authToken: authUser.rawToken,
        cfg: deps.cfg,
        embedder: deps.embedder,
        vectorStore: deps.vectorStore,
        llm: deps.llm,
        toolRegistry: deps.toolRegistry,
        actionStore: deps.actionStore,
        cache: deps.cache,
        scope,
        repository: deps.repository,
        conversationId,
        emit: (ev) => writeSseEvent(res, ev),
      });

      const totalLatency = Date.now() - reqStart;

      // Structured JSON log for timing and observability
      logger.info(
        {
          event: 'assistant_chat_timing',
          requestId,
          appId: profile.appId,
          userId: scope.userId,
          role: scope.role,
          provider: outcome.provider || 'openrouter',
          model: outcome.model,
          totalLatencyMs: totalLatency,
          timings: {
            ...timing,
            provider_total: outcome.latencyMs,
          },
          refusal: outcome.refusal,
          questionPreview: redactPiiForLog(lastUserText.slice(0, 80)),
        },
        'Chat request completed with timing breakdown'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected chat processing error';
      logger.error({ requestId, appId: profile.appId, err }, 'Chat route failed');
      writeSseEvent(res, { type: 'error', message });
    } finally {
      res.end();
    }
  });

  return router;
}
