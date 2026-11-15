import type { AppProfile, RetrievedChunk, RightClickContext, SourceCitation } from '@ai-assistant/core';
import type { ProfileRegistry } from '../profiles/loader.ts';
import type { AccessScope } from '../security/scope.ts';
import { chunkMarkdown } from './chunker.ts';
import type { Embedder } from './embedder.ts';
import type { EmbeddedChunk, VectorStore } from './store.ts';

export interface RetrievalOutcome {
  refused: boolean;
  refusalMessage?: string;
  chunks: RetrievedChunk[];
  citations: SourceCitation[];
  topScore: number;
}

export async function ingestAppDocs(params: {
  appId: string;
  profiles: ProfileRegistry;
  embedder: Embedder;
  store: VectorStore;
}): Promise<{ appId: string; docsCount: number; chunksCount: number }> {
  const docs = params.profiles.getDocs(params.appId);
  await params.store.deleteAppChunks(params.appId);

  const allChunks = docs.flatMap((doc) =>
    chunkMarkdown({
      appId: params.appId,
      source: doc.source,
      markdown: doc.content,
    })
  );

  if (allChunks.length === 0) {
    return { appId: params.appId, docsCount: docs.length, chunksCount: 0 };
  }

  const embeddings = await params.embedder.embed(
    allChunks.map((c) => `${c.heading}\n${c.content}`)
  );

  const embedded: EmbeddedChunk[] = allChunks.map((chunk, idx) => ({
    ...chunk,
    embedding: embeddings[idx],
  }));

  await params.store.upsertChunks(params.appId, embedded);
  return {
    appId: params.appId,
    docsCount: docs.length,
    chunksCount: embedded.length,
  };
}

export async function ingestAllProfiles(params: {
  profiles: ProfileRegistry;
  embedder: Embedder;
  store: VectorStore;
}): Promise<Array<{ appId: string; docsCount: number; chunksCount: number }>> {
  const results: Array<{ appId: string; docsCount: number; chunksCount: number }> = [];
  for (const profile of params.profiles.listProfiles()) {
    const res = await ingestAppDocs({
      appId: profile.appId,
      profiles: params.profiles,
      embedder: params.embedder,
      store: params.store,
    });
    results.push(res);
  }
  return results;
}

export function buildRetrievalQuery(
  question: string,
  context?: RightClickContext,
  contexts?: RightClickContext[]
): string {
  const list = contexts && contexts.length > 0 ? contexts : context ? [context] : [];
  if (list.length === 0) return question;
  const parts: Array<string | undefined> = [question];
  for (const ctx of list) {
    parts.push(
      ctx.selectedText,
      ctx.nearbyLabel,
      ctx.text,
      ctx.routePath?.replace(/[/-]/g, ' ')
    );
  }
  return parts.filter(Boolean).join(' ').trim();
}

export async function retrieveForQuery(params: {
  profile: AppProfile;
  question: string;
  context?: RightClickContext;
  contexts?: RightClickContext[];
  embedder: Embedder;
  store: VectorStore;
  bypassOutOfScopeGuard?: boolean;
  scope?: AccessScope;
  allowedVisibilities?: Array<'all' | 'manager' | 'admin'>;
}): Promise<RetrievalOutcome> {
  const queryText = buildRetrievalQuery(params.question, params.context, params.contexts);
  const queryEmbedding = await params.embedder.embedOne(queryText);

  let visibilities = params.allowedVisibilities;
  if (!visibilities && params.scope) {
    if (params.scope.role === 'SUPER_ADMIN' || params.scope.role === 'ADMIN') {
      visibilities = ['all', 'manager', 'admin'];
    } else if (params.scope.role === 'SECTOR_MANAGER') {
      visibilities = ['all', 'manager'];
    } else if (params.scope.role === 'PUBLIC') {
      visibilities = ['all'];
    } else {
      visibilities = ['all'];
    }
  }

  // First query with minScore=0 to inspect true topScore for logging and guard evaluation
  const rawTop = await params.store.query({
    appId: params.profile.appId,
    queryEmbedding,
    queryText,
    topK: params.profile.retrieval.topK,
    minScore: 0,
    allowedVisibilities: visibilities,
  });

  const topScore = rawTop.length > 0 ? rawTop[0].score : 0;
  const minScore = params.profile.retrieval.minScore;

  if (!params.bypassOutOfScopeGuard && topScore < minScore) {
    return {
      refused: true,
      refusalMessage: params.profile.refusalMessage,
      chunks: [],
      citations: [],
      topScore,
    };
  }

  const qualifying = rawTop.filter((c) => c.score >= minScore);
  const citations: SourceCitation[] = [];
  const seen = new Set<string>();
  for (const chunk of qualifying) {
    const key = `${chunk.source}::${chunk.heading}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({
        source: chunk.source,
        heading: chunk.heading,
        score: chunk.score,
      });
    }
  }

  return {
    refused: false,
    chunks: qualifying,
    citations,
    topScore,
  };
}
