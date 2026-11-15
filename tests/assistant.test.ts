import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AssistantSseEvent,
  ImportPreviewResult,
  type AppProfile,
} from '@ai-assistant/core';
import {
  ActionLogStore,
  chunkMarkdown,
  computeLocalEmbedding,
  createAssistantRuntime,
  createConfirmationToken,
  createEmbedder,
  generateErrorReportCsv,
  inferDeterministicToolCall,
  InMemoryVectorStore,
  ingestAppDocs,
  loadConfig,
  mountAssistantRoutes,
  parseSpreadsheetBuffer,
  ProfileRegistry,
  ProviderFallbackChain,
  ResponseCache,
  retrieveForQuery,
  runChatAgent,
  shouldUseAgentLoop,
  ToolRegistry,
  validateSpreadsheetRows,
  verifyConfirmationToken,
  type LlmGateway,
} from '@ai-assistant/server';
import {
  createCollegeFinanceRouter,
  createCollegeFinanceStore,
  DEMO_FINANCE_TOKEN,
} from '../apps/demo-college-finance/server.ts';
import {
  createLibraryRouter,
  createLibraryStore,
  DEMO_LIBRARY_TOKEN,
} from '../apps/second-demo-app/server.ts';

describe('RAG Chunker', () => {
  it('chunks markdown by headings and splits oversized sections with overlap', () => {
    const longParagraph = Array.from({ length: 180 }, (_, i) => `word${i}`).join(' ');
    const md = `# Overview\nShort intro.\n\n## Deep Section\n${longParagraph}`;

    const chunks = chunkMarkdown({
      appId: 'test-app',
      source: 'guide.md',
      markdown: md,
      maxTokens: 120,
      overlapTokens: 25,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].heading).toBe('Overview');
    expect(chunks[1].heading).toBe('Overview > Deep Section');
    expect(chunks[1].appId).toBe('test-app');
    // Check overlap between consecutive oversized chunks
    const words1 = new Set(chunks[1].content.split(/\s+/));
    const words2 = chunks[2].content.split(/\s+/);
    const overlapHits = words2.filter((w) => words1.has(w));
    expect(overlapHits.length).toBeGreaterThan(5);
  });
});

describe('Retriever Threshold, Refusal Guard & Cross-App Isolation', () => {
  it('refuses out-of-scope questions and isolates app A docs from app B', async () => {
    const cfg = loadConfig({
      nodeEnv: 'test',
      openRouterApiKey: '',
      groqApiKey: '',
      geminiApiKey: '',
      supabaseUrl: '',
      supabaseServiceRoleKey: '',
    });
    const profiles = new ProfileRegistry();
    await profiles.loadAll(cfg.profilesDir);

    const embedder = createEmbedder(cfg);
    const store = new InMemoryVectorStore();

    await ingestAppDocs({ appId: 'college-finance', profiles, embedder, store });
    await ingestAppDocs({ appId: 'second-demo', profiles, embedder, store });

    const financeProfile = profiles.getProfile('college-finance')!;
    const libraryProfile = profiles.getProfile('second-demo')!;

    // 1. In-scope finance query succeeds
    const inScope = await retrieveForQuery({
      profile: financeProfile,
      question: 'How do I select a funding option?',
      embedder,
      store,
    });
    expect(inScope.refused).toBe(false);
    expect(inScope.chunks.length).toBeGreaterThan(0);
    expect(inScope.chunks.every((c) => c.appId === 'college-finance')).toBe(true);

    // 2. Out-of-scope query triggers refusal without LLM
    const outScope = await retrieveForQuery({
      profile: financeProfile,
      question: 'Who won the football match last night?',
      embedder,
      store,
    });
    expect(outScope.refused).toBe(true);
    expect(outScope.refusalMessage).toBe(financeProfile.refusalMessage);

    // 3. Cross-app isolation: college-finance question asked against second-demo (library) must refuse or never return finance docs
    const crossApp = await retrieveForQuery({
      profile: libraryProfile,
      question: 'How do I import students from Excel for union fees and charity funds?',
      embedder,
      store,
    });
    expect(crossApp.chunks.every((c) => c.appId === 'second-demo')).toBe(true);
    expect(crossApp.refused).toBe(true);
  });
});

describe('Spreadsheet Parsing & Zod Validation', () => {
  it('tolerates case/spacing header variations and flags invalid rows with reasons', async () => {
    const cfg = loadConfig({ nodeEnv: 'test' });
    const profiles = new ProfileRegistry();
    await profiles.loadAll(cfg.profilesDir);
    const template = profiles.getTemplate('college-finance', 'students-template')!;

    const csvContent = [
      'admission_no,full_name,email_address,sector_code,union_name,funding_source,fee_amount',
      'CF-901,Maya Pillai,maya@campus.edu,ENG,Tech Union,Student Fees,42000',
      'CF-902,Invalid Email,bad-email,SCI,Science Forum,Charity,36000',
      'CF-903,Invalid Fund,ok@campus.edu,COM,Commerce Guild,UnknownGrant,-100',
    ].join('\n');

    const parsed = parseSpreadsheetBuffer(Buffer.from(csvContent, 'utf8'), 'students.csv');
    const preview = validateSpreadsheetRows({
      uploadId: 'upl_test',
      appId: 'college-finance',
      fileName: 'students.csv',
      template,
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.totalRows,
      truncated: parsed.truncated,
    });

    expect(preview.totalRows).toBe(3);
    expect(preview.validCount).toBe(1);
    expect(preview.invalidCount).toBe(2);
    expect(preview.errors[0].rowNumber).toBe(3);
    expect(preview.errors[0].reasons.join(' ')).toContain('valid email');
    expect(preview.errors[1].rowNumber).toBe(4);

    const errorCsv = generateErrorReportCsv(preview.errors);
    expect(errorCsv).toContain('Row Number,Validation Errors');
    expect(errorCsv).toContain('CF-902');
  });
});

describe('Confirmation Token Security', () => {
  it('verifies valid tokens and rejects tampered, cross-app, or cross-user tokens', () => {
    const secret = 'test-hmac-secret';
    const { token } = createConfirmationToken(
      {
        actionId: 'act_1',
        appId: 'college-finance',
        userId: 'user-a',
        toolName: 'createSector',
        args: { code: 'BIO', name: 'Biotech' },
      },
      secret
    );

    const ok = verifyConfirmationToken(
      token,
      { actionId: 'act_1', appId: 'college-finance', userId: 'user-a' },
      secret
    );
    expect(ok.valid).toBe(true);

    const wrongUser = verifyConfirmationToken(
      token,
      { actionId: 'act_1', appId: 'college-finance', userId: 'user-b' },
      secret
    );
    expect(wrongUser.valid).toBe(false);

    const wrongApp = verifyConfirmationToken(
      token,
      { actionId: 'act_1', appId: 'second-demo', userId: 'user-a' },
      secret
    );
    expect(wrongApp.valid).toBe(false);

    const tampered = `${token.slice(0, -3)}xyz`;
    const badSig = verifyConfirmationToken(
      tampered,
      { actionId: 'act_1', appId: 'college-finance', userId: 'user-a' },
      secret
    );
    expect(badSig.valid).toBe(false);
  });
});

describe('Agent Loop Limits & Repeated-Call Guard', () => {
  it('stops when the LLM repeats identical read tool calls or hits maxSteps', async () => {
    const cfg = loadConfig({
      nodeEnv: 'test',
      openRouterApiKey: '',
      groqApiKey: '',
      geminiApiKey: '',
      supabaseUrl: '',
      supabaseServiceRoleKey: '',
    });
    const profile: AppProfile = {
      appId: 'college-finance',
      displayName: 'College Finance',
      systemPrompt: 'Test prompt',
      languages: ['en'],
      refusalMessage: 'Refused',
      retrieval: { topK: 3, minScore: 0.1 },
      tools: ['listStudents'],
      customTools: [],
      api: { baseUrl: 'http://localhost:9999' },
      auth: { mode: 'none' },
      corsOrigins: ['*'],
      templates: [],
    };

    const embedder = createEmbedder(cfg);
    const store = new InMemoryVectorStore();
    const emb = computeLocalEmbedding('list students directory');
    await store.upsertChunks('college-finance', [
      {
        id: 'c1',
        appId: 'college-finance',
        source: 'doc.md',
        heading: 'Students',
        chunkIndex: 0,
        content: 'List students directory and fees.',
        tokenCount: 10,
        embedding: emb,
      },
    ]);

    let llmCalls = 0;
    const loopingLlm: LlmGateway = {
      hasLiveProvider: true,
      chain: new ProviderFallbackChain(cfg),
      async streamChat() {
        return { fullText: 'ok', modelUsed: 'mock' };
      },
      async completeWithTools() {
        llmCalls += 1;
        return {
          content: '',
          toolCalls: [
            {
              id: `tc_${llmCalls}`,
              name: 'listStudents',
              argumentsJson: '{"sectorCode":"ENG"}',
            },
          ],
          modelUsed: 'mock-strong',
        };
      },
    };

    const events: AssistantSseEvent[] = [];
    await runChatAgent({
      profile,
      messages: [{ role: 'user', content: 'list students in ENG' }],
      userId: 'u1',
      authToken: '',
      cfg,
      embedder,
      vectorStore: store,
      llm: loopingLlm,
      toolRegistry: new ToolRegistry(),
      actionStore: new ActionLogStore(),
      cache: new ResponseCache(0),
      emit: (e) => events.push(e),
      maxSteps: 6,
    });

    // Step 1 executes listStudents; Step 2 returns the identical call and halts immediately
    expect(llmCalls).toBe(2);
    const text = events
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(text).toContain('repeating the identical tool call');
  });
});

describe('Integration: Excel Upload -> Preview -> Confirm Import -> Undo', () => {
  let server: ReturnType<express.Express['listen']>;
  let baseUrl = '';
  const demoStore = createCollegeFinanceStore();
  const libraryStore = createLibraryStore();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/demo/college-finance', createCollegeFinanceRouter(demoStore));
    app.use('/api/demo/second-demo', createLibraryRouter(libraryStore));

    const runtime = await createAssistantRuntime({
      nodeEnv: 'test',
      openRouterApiKey: '',
      groqApiKey: '',
      geminiApiKey: '',
      supabaseUrl: '',
      supabaseServiceRoleKey: '',
      profilesDir: path.resolve(process.cwd(), 'profiles'),
    });

    // Listen on ephemeral port and update runtime port so /me & tool API calls hit this test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        runtime.cfg.port = addr.port;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        mountAssistantRoutes(app, runtime);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('uploads an xlsx file with 2 valid and 2 invalid rows, previews, confirms import, and supports undo', async () => {
    const initialCount = demoStore.students.length;

    const rows = [
      {
        'Admission No': 'CF-2026-701',
        'Full Name': 'Anitha Jose',
        Email: 'anitha.j@campus.edu',
        'Sector Code': 'ENG',
        'Union Name': 'Tech Union',
        'Funding Option': 'Student Fees',
        'Fee Amount': 42000,
      },
      {
        'Admission No': 'CF-2026-702',
        'Full Name': 'Rahul Das',
        Email: 'rahul.d@campus.edu',
        'Sector Code': 'SCI',
        'Union Name': 'Science Forum',
        'Funding Option': 'Charity',
        'Fee Amount': 36000,
      },
      {
        'Admission No': 'CF-2026-703',
        'Full Name': 'Broken Email User',
        Email: 'invalid-email-format',
        'Sector Code': 'COM',
        'Union Name': 'Commerce Guild',
        'Funding Option': 'Student Fees',
        'Fee Amount': 28000,
      },
      {
        'Admission No': 'CF-2026-704',
        'Full Name': 'Broken Funding User',
        Email: 'valid@campus.edu',
        'Sector Code': 'ART',
        'Union Name': 'Humanities Collective',
        'Funding Option': 'CryptoLoan',
        'Fee Amount': 25000,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const form = new FormData();
    form.append('appId', 'college-finance');
    form.append(
      'file',
      new Blob([new Uint8Array(xlsxBuf)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'students-upload.xlsx'
    );

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEMO_FINANCE_TOKEN}`,
        'x-app-id': 'college-finance',
      },
      body: form,
    });
    expect(uploadRes.status).toBe(200);

    const preview = (await uploadRes.json()) as ImportPreviewResult;
    expect(preview.totalRows).toBe(4);
    expect(preview.validCount).toBe(2);
    expect(preview.invalidCount).toBe(2);
    expect(preview.actionId).toBeTruthy();
    expect(preview.confirmationToken).toBeTruthy();

    // Nothing written before Confirm!
    expect(demoStore.students.length).toBe(initialCount);

    // Confirm the import action
    const confirmRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(preview.actionId!)}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEMO_FINANCE_TOKEN}`,
          'x-app-id': 'college-finance',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId: 'college-finance',
          confirmationToken: preview.confirmationToken,
          decision: 'confirm',
        }),
      }
    );
    expect(confirmRes.status).toBe(200);
    const confirmJson = (await confirmRes.json()) as {
      ok: boolean;
      result: { addedCount: number };
    };
    expect(confirmJson.ok).toBe(true);
    expect(confirmJson.result.addedCount).toBe(2);
    expect(demoStore.students.length).toBe(initialCount + 2);

    // Undo the import
    const undoRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(preview.actionId!)}/undo`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEMO_FINANCE_TOKEN}`,
          'x-app-id': 'college-finance',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId: 'college-finance' }),
      }
    );
    expect(undoRes.status).toBe(200);
    expect(demoStore.students.length).toBe(initialCount);
  });

  it('emits ui_action for markStudentPaid and supports unpay undo', async () => {
    const profiles = new ProfileRegistry();
    await profiles.loadAll(path.resolve(process.cwd(), 'profiles'));
    const financeProfile = profiles.getProfile('college-finance')!;

    expect(shouldUseAgentLoop('Mark Devika Ramesh as paid', financeProfile)).toBe(true);
    expect(shouldUseAgentLoop('How do I mark a student as paid?', financeProfile)).toBe(false);

    const tools = new ToolRegistry().getToolsForProfile(financeProfile);
    const inferred = inferDeterministicToolCall('Mark Devika Ramesh as paid', tools, []);
    expect(inferred).toEqual({
      name: 'markStudentPaid',
      args: { studentName: 'Devika Ramesh' },
    });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEMO_FINANCE_TOKEN}`,
        'x-app-id': 'college-finance',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: 'college-finance',
        messages: [{ role: 'user', content: 'Mark Devika Ramesh as paid' }],
      }),
    });
    expect(res.status).toBe(200);

    const sseBody = await res.text();
    const events: AssistantSseEvent[] = sseBody
      .split('\n\n')
      .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
      .filter((line): line is string => Boolean(line))
      .map((line) => JSON.parse(line.slice(6)) as AssistantSseEvent);

    const uiAction = events.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(uiAction).toBeDefined();
    expect(uiAction?.action).toBe('click');
    expect(uiAction?.selector).toBe('[data-aia-action="mark-paid"][data-aia-id="stu-103"]');
    expect(uiAction?.fallbackTabSelector).toBe('[data-aia-tab="students"]');

    // Simulate the DOM button click calling /students/stu-103/pay, then verify undo reverts it to Pending
    const payRes = await fetch(`${baseUrl}/api/demo/college-finance/students/stu-103/pay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DEMO_FINANCE_TOKEN}` },
    });
    expect(payRes.status).toBe(200);
    expect(demoStore.students.find((s) => s.id === 'stu-103')?.status).toBe('Paid');

    const undoRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(uiAction!.actionId)}/undo`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEMO_FINANCE_TOKEN}`,
          'x-app-id': 'college-finance',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId: 'college-finance' }),
      }
    );
    expect(undoRes.status).toBe(200);
    expect(demoStore.students.find((s) => s.id === 'stu-103')?.status).toBe('Pending');
  });

  it('auto-executes addStudent, createSector, addFund, and controlAppUi with live UI refresh and undo', async () => {
    const sendChat = async (appId: string, token: string, content: string) => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-app-id': appId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId,
          messages: [{ role: 'user', content }],
        }),
      });
      expect(res.status).toBe(200);
      const sseBody = await res.text();
      return sseBody
        .split('\n\n')
        .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
        .filter((line): line is string => Boolean(line))
        .map((line) => JSON.parse(line.slice(6)) as AssistantSseEvent);
    };

    // 1. Add student directly
    const initialStudents = demoStore.students.length;
    const addStuEvents = await sendChat(
      'college-finance',
      DEMO_FINANCE_TOKEN,
      'Add student Kiran Verma, email kiran.v@campus.edu, sector ENG, fee 45000'
    );
    const stuExecuted = addStuEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    const stuUi = addStuEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(stuExecuted?.toolName).toBe('addStudent');
    expect(stuExecuted?.canUndo).toBe(true);
    expect(stuUi?.action).toBe('refresh');
    expect(stuUi?.fallbackTabSelector).toBe('[data-aia-tab="students"]');
    expect(demoStore.students.length).toBe(initialStudents + 1);
    expect(demoStore.students[0].fullName).toBe('Kiran Verma');

    // Undo addStudent deletes the newly enrolled student
    const undoStuRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(stuExecuted!.actionId)}/undo`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEMO_FINANCE_TOKEN}`,
          'x-app-id': 'college-finance',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId: 'college-finance' }),
      }
    );
    expect(undoStuRes.status).toBe(200);
    expect(demoStore.students.length).toBe(initialStudents);

    // 2. Create sector directly
    const initialSectors = demoStore.sectors.length;
    const secEvents = await sendChat(
      'college-finance',
      DEMO_FINANCE_TOKEN,
      'Create sector BIO Biotechnology Bio Union budget 300000'
    );
    const secExecuted = secEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    expect(secExecuted?.toolName).toBe('createSector');
    expect(demoStore.sectors.length).toBe(initialSectors + 1);
    expect(demoStore.sectors[0].code).toBe('BIO');

    // 3. Add fund directly
    const initialFunds = demoStore.funds.length;
    const fundEvents = await sendChat(
      'college-finance',
      DEMO_FINANCE_TOKEN,
      'Add charity fund Alumni Support 75000 for BIO'
    );
    const fundExecuted = fundEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    expect(fundExecuted?.toolName).toBe('addFund');
    expect(demoStore.funds.length).toBe(initialFunds + 1);
    expect(demoStore.funds[0].sourceName).toBe('Alumni Support');

    // 4. UI navigation & filter control
    const navEvents = await sendChat('college-finance', DEMO_FINANCE_TOKEN, 'Filter students by ENG');
    const navUi = navEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(navUi?.fallbackTabSelector).toBe('[data-aia-tab="students"]');
    expect(navUi?.followUpActions?.[0]).toEqual({
      action: 'set_value',
      selector: '[data-aia-control="sector-filter"]',
      value: 'ENG',
    });

    // 5. Campus Library (second-demo): addBook, borrowBook, returnBook
    const initialBooks = libraryStore.books.length;
    const bookEvents = await sendChat(
      'second-demo',
      DEMO_LIBRARY_TOKEN,
      'Add book System Design by Alex Xu shelf CS-09 copies 4'
    );
    const bookExecuted = bookEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    expect(bookExecuted?.toolName).toBe('addBook');
    expect(libraryStore.books.length).toBe(initialBooks + 1);

    const borrowEvents = await sendChat(
      'second-demo',
      DEMO_LIBRARY_TOKEN,
      'Borrow Clean Architecture for Meera Nair'
    );
    const borrowExecuted = borrowEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    expect(borrowExecuted?.toolName).toBe('borrowBook');
    expect(libraryStore.loans[0].memberName).toBe('Meera Nair');

    const returnEvents = await sendChat(
      'second-demo',
      DEMO_LIBRARY_TOKEN,
      'Return Clean Architecture loan'
    );
    const returnExecuted = returnEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    expect(returnExecuted?.toolName).toBe('returnBook');
    expect(libraryStore.loans[0].returned).toBe(true);

    // 6. Out-of-scope query still gets refused cleanly
    const oosEvents = await sendChat(
      'college-finance',
      DEMO_FINANCE_TOKEN,
      'Write a poem about football'
    );
    const doneEvent = oosEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'done' }> => e.type === 'done'
    );
    expect(doneEvent?.refusal).toBe(true);
  });

  it('supports Khazna Campus Ledger RAG, student spreadsheet import/undo, cursor inspection, and appCommand actions', async () => {
    const sampleKhaznaState = {
      role: 'admin',
      pathname: '/admin',
      college: { id: 'demo', name: 'Islahul Uloom', demo: true },
      meStudentId: 'S0125',
      managerSector: 'dept-fiqh',
      totalStudents: 2,
      sectors: [
        { slug: 'office', name: 'Office', short: 'OF', receiptPrefix: 'OF-', target: 400000 },
        { slug: 'dept-fiqh', name: 'Dept. Fiqh', short: 'DF', receiptPrefix: 'DF-', target: 250000 },
      ],
      classes: ['Fiqh 2', 'Thanawiyya 1'],
      students: [
        { id: 'S0125', name: 'Safwan K.', className: 'Fiqh 2', guardian: 'Kareem' },
        { id: 'S0126', name: 'Rashid P.', className: 'Thanawiyya 1', guardian: 'Moosa' },
      ],
      recentTransactions: [
        {
          id: 'TX100',
          sector: 'dept-fiqh',
          studentId: 'S0125',
          studentName: 'Safwan K.',
          type: 'debit',
          title: 'Term Fee',
          amount: 1200,
          date: '2026-11-10',
          receiptNo: 'DF-224',
        },
      ],
    };

    const sendKhaznaChat = async (
      content: string,
      context?: { routePath: string; tag: string; text: string; nearbyLabel?: string }
    ) => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId: 'khazna-ledger',
          messages: [{ role: 'user', content }],
          appState: sampleKhaznaState,
          context,
        }),
      });
      expect(res.status).toBe(200);
      const sseBody = await res.text();
      return sseBody
        .split('\n\n')
        .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
        .filter((line): line is string => Boolean(line))
        .map((line) => JSON.parse(line.slice(6)) as AssistantSseEvent);
    };

    // 1. RAG Q&A on Khazna ledger voiding
    const ragEvents = await sendKhaznaChat('How does append-only voiding work in Khazna Campus Ledger?');
    const ragDone = ragEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'done' }> => e.type === 'done'
    );
    expect(ragDone?.refusal).toBe(false);

    // 2. Cursor Denoter element inspection stays conversational
    const inspectEvents = await sendKhaznaChat('What does "Active Sectors" show here?', {
      routePath: '/admin',
      tag: 'div',
      text: 'Active Sectors 4',
      nearbyLabel: 'Active Sectors',
    });
    const inspectText = inspectEvents
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(inspectText).not.toContain('<div>');
    expect(inspectText).not.toContain('CAPTURED UI');
    expect(inspectText.toLowerCase()).toContain('active sectors');

    // 3. Create entry emits ui_action with appCommand CREATE_ENTRY and undo emits DELETE_ENTRIES
    const entryEvents = await sendKhaznaChat(
      'Record ₹1500 credit deposit for Safwan K. in Office'
    );
    const entryUi = entryEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(entryUi?.appCommand?.command).toBe('CREATE_ENTRY');
    expect(entryUi?.appCommand?.payload?.amount).toBe(1500);
    expect(entryUi?.appCommand?.payload?.sector).toBe('office');

    const undoEntryRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(entryUi!.actionId)}/undo`,
      {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId: 'khazna-ledger' }),
      }
    );
    expect(undoEntryRes.status).toBe(200);
    const undoEntryJson = (await undoEntryRes.json()) as {
      ok: boolean;
      undoUiAction?: { appCommand?: { command: string } };
    };
    expect(undoEntryJson.ok).toBe(true);
    expect(undoEntryJson.undoUiAction?.appCommand?.command).toBe('DELETE_ENTRIES');

    // 4. Add student, post batch, navigate, and set theme emit appCommands
    const stuEvents = await sendKhaznaChat('Add student Amina K. to class Fiqh 2');
    const stuUi = stuEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(stuUi?.appCommand?.command).toBe('ADD_STUDENT');

    const batchEvents = await sendKhaznaChat('Post ₹500 Study Tour Fee batch for Fiqh 2');
    const batchUi = batchEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(batchUi?.appCommand?.command).toBe('POST_BATCH');

    const navEvents = await sendKhaznaChat('Open Super Admin demo dashboard');
    const navUi = navEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(navUi?.appCommand?.command).toBe('NAVIGATE');

    const themeEvents = await sendKhaznaChat('Switch to dark mode');
    const themeUi = themeEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(themeUi?.appCommand?.command).toBe('SET_THEME');

    // 5. Khazna CSV/XLSX student upload -> preview -> confirm -> undo
    const khaznaCsv = [
      'Ad.No,Full Name,Class,Phone,Guardian',
      'S0901,Fathima N.,Fiqh 2,9847001122,Nazeer',
      'S0902,Salman R.,Thanawiyya 1,9847003344,Rasheed',
    ].join('\n');

    const form = new FormData();
    form.append('appId', 'khazna-ledger');
    form.append(
      'file',
      new Blob([khaznaCsv], { type: 'text/csv' }),
      'khazna-students.csv'
    );
    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger' },
      body: form,
    });
    expect(uploadRes.status).toBe(200);
    const preview = (await uploadRes.json()) as ImportPreviewResult;
    expect(preview.validCount).toBe(2);
    expect(preview.invalidCount).toBe(0);

    const confirmRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(preview.actionId!)}/confirm`,
      {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId: 'khazna-ledger',
          confirmationToken: preview.confirmationToken,
          decision: 'confirm',
        }),
      }
    );
    expect(confirmRes.status).toBe(200);
    const confirmJson = (await confirmRes.json()) as {
      ok: boolean;
      uiAction?: { appCommand?: { command: string; payload?: { students?: unknown[] } } };
    };
    expect(confirmJson.ok).toBe(true);
    expect(confirmJson.uiAction?.appCommand?.command).toBe('IMPORT_STUDENTS');
    expect(confirmJson.uiAction?.appCommand?.payload?.students?.length).toBe(2);

    const undoImportRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(preview.actionId!)}/undo`,
      {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId: 'khazna-ledger' }),
      }
    );
    expect(undoImportRes.status).toBe(200);
    const undoImportJson = (await undoImportRes.json()) as {
      ok: boolean;
      undoUiAction?: { appCommand?: { command: string } };
    };
    expect(undoImportJson.undoUiAction?.appCommand?.command).toBe('DELETE_STUDENTS');

    // 6. Single-prompt downloads + Ghost cursor waypoints
    const pdfDlEvents = await sendKhaznaChat('Download class report PDF');
    const pdfDlUi = pdfDlEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(pdfDlUi?.appCommand?.command).toBe('DOWNLOAD_REPORT');
    expect(pdfDlUi?.appCommand?.payload?.format).toBe('pdf');
    expect(Array.isArray(pdfDlUi?.cursorWaypoints)).toBe(true);
    expect((pdfDlUi?.cursorWaypoints?.length || 0) > 0).toBe(true);

    const xlsxDlEvents = await sendKhaznaChat('Export class report Excel');
    const xlsxDlUi = xlsxDlEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(xlsxDlUi?.appCommand?.command).toBe('DOWNLOAD_REPORT');
    expect(xlsxDlUi?.appCommand?.payload?.format).toBe('xlsx');

    const stmtDlEvents = await sendKhaznaChat('Download statement PDF for Safwan K.');
    const stmtDlUi = stmtDlEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(stmtDlUi?.appCommand?.command).toBe('DOWNLOAD_STUDENT_STATEMENT');

    const auditDlEvents = await sendKhaznaChat('Download audit log CSV');
    const auditDlUi = auditDlEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(auditDlUi?.appCommand?.command).toBe('DOWNLOAD_AUDIT_CSV');

    const tplDlEvents = await sendKhaznaChat('Download students CSV template');
    const tplDlUi = tplDlEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(tplDlUi?.appCommand?.command).toBe('DOWNLOAD_TEMPLATE_CSV');

    // 7. Incomplete prompt triggers Human-in-the-Loop column form_request
    const hilEvents = await sendKhaznaChat('Add student');
    const hilForm = hilEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'form_request' }> => e.type === 'form_request'
    );
    expect(hilForm?.form.command).toBe('ADD_STUDENT');
    expect(hilForm?.form.fields.some((f) => f.key === 'name')).toBe(true);
    expect(hilForm?.form.fields.some((f) => f.key === 'className')).toBe(true);

    // 8. Personalization settings accepted cleanly by /api/chat
    const prefRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'x-app-id': 'khazna-ledger',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'How does append-only voiding work?' }],
        personalization: {
          displayName: 'Principal',
          tone: 'concise',
          preferredLanguage: 'en',
          customInstructions: 'Keep summaries to 2 sentences.',
        },
        appState: sampleKhaznaState,
      }),
    });
    expect(prefRes.status).toBe(200);

    // 9. /api/transcribe validates missing audio payload with 400
    const badVoiceRes = await fetch(`${baseUrl}/api/transcribe`, {
      method: 'POST',
      headers: {
        'x-app-id': 'khazna-ledger',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(badVoiceRes.status).toBe(400);

    // 10. New Khazna Campus account creation via natural prompt
    const signupEvents = await sendKhaznaChat(
      'can you create a new account in this khazna campus, with college name as : islahul Uloom Arabic College. and My full name is : Midlaj, and email is : nothingisspecial78@gmail.com and set password as 10271027.'
    );
    const signupUi = signupEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(signupUi?.appCommand?.command).toBe('SIGNUP_COLLEGE');
    expect(signupUi?.appCommand?.payload?.college).toBe('islahul Uloom Arabic College');
    expect(signupUi?.appCommand?.payload?.name).toBe('Midlaj');
    expect(signupUi?.appCommand?.payload?.email).toBe('nothingisspecial78@gmail.com');
    expect(signupUi?.appCommand?.payload?.password).toBe('10271027');

    // 11. Strict Student RBAC: "currently open display report" never leaks other students or campus sector totals
    const sendScopedChat = async (content: string, scopedState: Record<string, unknown>) => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'x-app-id': 'khazna-ledger', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: 'khazna-ledger',
          messages: [{ role: 'user', content }],
          appState: scopedState,
        }),
      });
      expect(res.status).toBe(200);
      const sseBody = await res.text();
      return sseBody
        .split('\n\n')
        .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
        .filter((line): line is string => Boolean(line))
        .map((line) => JSON.parse(line.slice(6)) as AssistantSseEvent);
    };

    const studentScopedState = {
      role: 'student',
      pathname: '/app',
      college: { id: 'org_demo', name: 'Islahul Uloom (Demo)', demo: true },
      meStudentId: 'S0125',
      meStudent: { id: 'S0125', name: 'Safwan K.', className: 'Fiqh 2' },
      mySummary: { credit: 3000, debit: 1200, balance: 1800, count: 2 },
      mySectors: [{ slug: 'dept-fiqh', name: 'Dept. Fiqh', credit: 3000, debit: 1200, balance: 1800, count: 2 }],
      myTransactions: [
        { id: 'TX100', sector: 'dept-fiqh', studentId: 'S0125', studentName: 'Safwan K.', type: 'debit', title: 'Term Fee', amount: 1200, date: '2026-11-10', receiptNo: 'DF-224' },
      ],
    };

    const stuReportEvents = await sendScopedChat('can you give the currenly open display report', studentScopedState);
    const stuReportText = stuReportEvents
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(stuReportText).toContain('Safwan K.');
    expect(stuReportText).not.toContain('Siraj Usman');
    expect(stuReportText).not.toContain('Nabeel Qasim');
    expect(stuReportText).not.toContain('Rashid P.');

    const stuDeniedEntry = await sendScopedChat('Record ₹500 credit deposit in Office', studentScopedState);
    const stuDeniedText = stuDeniedEntry
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(stuDeniedText.toLowerCase()).toContain('access denied');
    expect(stuDeniedEntry.some((e) => e.type === 'ui_action')).toBe(false);

    // 12. Strict Sector Manager RBAC: only assigned managerSector visible, cross-sector post denied
    const managerScopedState = {
      role: 'manager',
      pathname: '/m/dept-fiqh',
      college: { id: 'org_demo', name: 'Islahul Uloom (Demo)', demo: true },
      managerSector: 'dept-fiqh',
      sectors: [{ slug: 'dept-fiqh', name: 'Dept. Fiqh', short: 'DF', receiptPrefix: 'DF-', target: 250000, credit: 5000, debit: 1200, balance: 3800, count: 2 }],
      students: [{ id: 'S0125', name: 'Safwan K.', className: 'Fiqh 2', credit: 5000, debit: 1200, balance: 3800, count: 2 }],
      recentTransactions: [{ id: 'TX100', sector: 'dept-fiqh', studentId: 'S0125', studentName: 'Safwan K.', type: 'debit', title: 'Term Fee', amount: 1200, date: '2026-11-10', receiptNo: 'DF-224' }],
    };

    const mgrCrossSector = await sendScopedChat('Record ₹500 credit deposit for Safwan K. in Office', managerScopedState);
    const mgrDeniedText = mgrCrossSector
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(mgrDeniedText.toLowerCase()).toContain('access denied');

    // 13. CSV formatMatched validation for defined target areas (reject bad schema, accept good schema with cursorWaypoints)
    const wrongForm = new FormData();
    wrongForm.append('appId', 'khazna-ledger');
    wrongForm.append('targetArea', 'managers');
    wrongForm.append('file', new Blob(['wrong_col,other\nfoo,bar\n'], { type: 'text/csv' }), 'bad-managers.csv');
    const badCsvRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger' },
      body: wrongForm,
    });
    expect(badCsvRes.status).toBe(200);
    const badPreview = (await badCsvRes.json()) as ImportPreviewResult;
    expect(badPreview.formatMatched).toBe(false);
    expect(badPreview.confirmationToken).toBeUndefined();

    const mgrForm = new FormData();
    mgrForm.append('appId', 'khazna-ledger');
    mgrForm.append('targetArea', 'managers');
    mgrForm.append(
      'file',
      new Blob(['name,email,phone,sectors\nUsthad Shameer,shameer@college.edu,9847001122,dept-fiqh\n'], { type: 'text/csv' }),
      'managers.csv'
    );
    const mgrUploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger' },
      body: mgrForm,
    });
    const mgrPreview = (await mgrUploadRes.json()) as ImportPreviewResult;
    expect(mgrPreview.formatMatched).toBe(true);
    expect(mgrPreview.targetTool).toBe('khaznaImportManagers');
    expect(mgrPreview.confirmationToken).toBeTruthy();

    const mgrConfirmRes = await fetch(
      `${baseUrl}/api/actions/${encodeURIComponent(mgrPreview.actionId!)}/confirm`,
      {
        method: 'POST',
        headers: { 'x-app-id': 'khazna-ledger', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: 'khazna-ledger',
          confirmationToken: mgrPreview.confirmationToken,
          decision: 'confirm',
          appState: sampleKhaznaState,
        }),
      }
    );
    const mgrConfirmJson = (await mgrConfirmRes.json()) as {
      ok: boolean;
      uiAction?: { appCommand?: { command: string }; cursorWaypoints?: unknown[] };
    };
    expect(mgrConfirmJson.ok).toBe(true);
    expect(mgrConfirmJson.uiAction?.appCommand?.command).toBe('IMPORT_MANAGERS');
    expect((mgrConfirmJson.uiAction?.cursorWaypoints?.length || 0) > 0).toBe(true);

    const bulkForm = new FormData();
    bulkForm.append('appId', 'khazna-ledger');
    bulkForm.append('targetArea', 'bulk-entries');
    bulkForm.append(
      'file',
      new Blob(['studentId,title,amount,type,sector\nS0125,Hostel Fee,750,debit,office\n'], { type: 'text/csv' }),
      'bulk.csv'
    );
    const bulkUploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger' },
      body: bulkForm,
    });
    const bulkPreview = (await bulkUploadRes.json()) as ImportPreviewResult;
    expect(bulkPreview.formatMatched).toBe(true);
    expect(bulkPreview.targetTool).toBe('khaznaImportBulkEntries');

    // 14. Individual student account lookup ("Siraj Usman in department fiqh") across all roles
    const adminSirajState = {
      role: 'admin',
      pathname: '/admin',
      college: { id: 'org_demo', name: 'Islahul Uloom (Demo)', demo: true },
      sectors: [
        { slug: 'office', name: 'Office', short: 'OF', receiptPrefix: 'OF-', target: 400000, credit: 5000, debit: 2000, balance: 3000, count: 4 },
        { slug: 'dept-fiqh', name: 'Dept. Fiqh', short: 'DF', receiptPrefix: 'DF-', target: 250000, credit: 2700, debit: 3900, balance: -1200, count: 5 },
      ],
      students: [
        {
          id: 'S0125',
          name: 'Safwan K.',
          className: 'Fiqh 2',
          credit: 1000,
          debit: 2500,
          balance: -1500,
          bySector: {
            'dept-fiqh': { credit: 1000, debit: 2500, balance: -1500, count: 2 },
          },
        },
        {
          id: 'S0156',
          name: 'Siraj Usman',
          className: 'Fiqh 2',
          credit: 2700,
          debit: 1900,
          balance: 800,
          bySector: {
            'dept-fiqh': { credit: 1700, debit: 900, balance: 800, count: 3 },
            office: { credit: 1000, debit: 1000, balance: 0, count: 2 },
          },
        },
      ],
      recentTransactions: [
        { id: 'TX201', sector: 'dept-fiqh', studentId: 'S0156', studentName: 'Siraj Usman', type: 'credit', title: 'Cash Deposit', amount: 1700, date: '2026-11-11', receiptNo: 'DF-301' },
      ],
    };

    const sirajQuery = 'give me the current account stable of the Siraj Usman in department fiqh';

    // 14a. Super Admin gets Siraj Usman's Dept. Fiqh figures + SSE lifecycle status events
    const adminSirajEvents = await sendScopedChat(sirajQuery, adminSirajState);
    const adminSirajText = adminSirajEvents
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(adminSirajText).toContain('Siraj Usman');
    expect(adminSirajText).toContain('Dept. Fiqh');
    expect(adminSirajText).toContain('1,700');
    expect(adminSirajText).toContain('800');
    expect(adminSirajEvents.some((e) => e.type === 'status' && e.phase === 'thinking')).toBe(true);
    expect(adminSirajEvents.some((e) => e.type === 'status' && e.phase === 'checking_permissions')).toBe(true);

    // 14b. Dept Fiqh Sector Manager gets Siraj Usman's Dept. Fiqh figures
    const fiqhMgrEvents = await sendScopedChat(sirajQuery, {
      role: 'manager',
      pathname: '/m/dept-fiqh',
      college: { id: 'org_demo', name: 'Islahul Uloom (Demo)', demo: true },
      managerSector: 'dept-fiqh',
      sectors: [{ slug: 'dept-fiqh', name: 'Dept. Fiqh', short: 'DF', receiptPrefix: 'DF-' }],
      students: [{ id: 'S0156', name: 'Siraj Usman', className: 'Fiqh 2', credit: 1700, debit: 900, balance: 800, count: 3 }],
      recentTransactions: [],
    });
    const fiqhMgrText = fiqhMgrEvents
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(fiqhMgrText).toContain('Siraj Usman');
    expect(fiqhMgrText).toContain('1,700');

    // 14c. Office Sector Manager is DENIED access to Dept Fiqh student account
    const officeMgrEvents = await sendScopedChat(sirajQuery, {
      role: 'manager',
      pathname: '/m/office',
      college: { id: 'org_demo', name: 'Islahul Uloom (Demo)', demo: true },
      managerSector: 'office',
      sectors: [{ slug: 'office', name: 'Office', short: 'OF', receiptPrefix: 'OF-' }],
      students: [{ id: 'S0156', name: 'Siraj Usman', className: 'Fiqh 2', credit: 1000, debit: 1000, balance: 0, count: 2 }],
      recentTransactions: [],
    });
    const officeMgrText = officeMgrEvents
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(officeMgrText.toLowerCase()).toContain('access denied');

    // 14d. Student Safwan K. is DENIED access to Siraj Usman's account
    const stuSirajEvents = await sendScopedChat(sirajQuery, studentScopedState);
    const stuSirajText = stuSirajEvents
      .filter((e): e is Extract<AssistantSseEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.delta)
      .join('');
    expect(stuSirajText.toLowerCase()).toContain('access denied');

    // 15. Collect Dues tool posts exact Cash Deposit settlement for Safwan K.
    const collectEvents = await sendScopedChat('collect dues for Safwan K. in Dept Fiqh', adminSirajState);
    const collectUi = collectEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'ui_action' }> => e.type === 'ui_action'
    );
    expect(collectUi?.appCommand?.command).toBe('CREATE_ENTRY');
    expect(collectUi?.appCommand?.payload?.studentId).toBe('S0125');
    expect(collectUi?.appCommand?.payload?.amount).toBe(1500);
    expect(collectUi?.appCommand?.payload?.sector).toBe('dept-fiqh');

    // 16. Password masking in tool_call and action_executed SSE events
    const signupToolCall = signupEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'tool_call' }> =>
        e.type === 'tool_call' && e.status === 'completed'
    );
    const signupExecuted = signupEvents.find(
      (e): e is Extract<AssistantSseEvent, { type: 'action_executed' }> => e.type === 'action_executed'
    );
    expect(signupToolCall?.args?.password).toBe('••••••••');
    expect(signupExecuted?.details?.password).toBe('••••••••');

    // 17. Multi-contexts array accepted cleanly on /api/chat
    const multiCtxRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'Explain these 2 selected cards' }],
        contexts: [
          { routePath: '/admin', tag: 'div', text: 'Active Sectors 5', nearbyLabel: 'Active Sectors' },
          { routePath: '/admin', tag: 'div', text: 'Total Students 56', nearbyLabel: 'Total Students' },
        ],
        appState: adminSirajState,
      }),
    });
    expect(multiCtxRes.status).toBe(200);

    // 18. CSV duplicate key detection & Role upload restriction
    const dupForm = new FormData();
    dupForm.append('appId', 'khazna-ledger');
    dupForm.append('role', 'admin');
    dupForm.append('targetArea', 'students');
    dupForm.append(
      'file',
      new Blob(
        [
          'id,name,className,phone,guardian\n' +
            'S0950,Zayd A.,Fiqh 2,9847001122,Ali\n' +
            'S0950,Zayd Duplicate,Fiqh 2,9847001123,Ali\n',
        ],
        { type: 'text/csv' }
      ),
      'dup-students.csv'
    );
    const dupRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger' },
      body: dupForm,
    });
    const dupPreview = (await dupRes.json()) as ImportPreviewResult;
    expect(dupPreview.duplicateCount).toBe(1);
    expect(dupPreview.validCount).toBe(1);
    expect(dupPreview.invalidCount).toBe(1);
    expect(dupPreview.errors[0].reasons.join(' ').toLowerCase()).toContain('duplicate');

    const stuCsvForm = new FormData();
    stuCsvForm.append('appId', 'khazna-ledger');
    stuCsvForm.append('role', 'student');
    stuCsvForm.append('targetArea', 'students');
    stuCsvForm.append(
      'file',
      new Blob(['id,name,className,phone,guardian\nS0951,Test,Fiqh 2,9847001122,P\n'], { type: 'text/csv' }),
      'stu-blocked.csv'
    );
    const stuCsvRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'x-app-id': 'khazna-ledger' },
      body: stuCsvForm,
    });
    const stuCsvPreview = (await stuCsvRes.json()) as ImportPreviewResult;
    expect(stuCsvPreview.formatMatched).toBe(false);
    expect(stuCsvPreview.permissionError).toBeTruthy();
    expect(stuCsvPreview.confirmationToken).toBeUndefined();
  });
});


