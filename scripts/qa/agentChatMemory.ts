import fs from 'node:fs';
import path from 'node:path';
import {
  loadUserThreads,
  saveUserThreads,
  makeEmptyThread,
  deriveThreadTitle,
  loadUserPersonalization,
  saveUserPersonalization,
  type StorageLike,
} from '../../packages/widget/src/hooks/useChatStorage.ts';

const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/chat-memory');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface ChatMemoryTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) || null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

export async function runChatMemoryAgent(): Promise<ChatMemoryTestResult[]> {
  console.log('\n=== [AGENT 6: CHAT MEMORY & PER-USER ISOLATION] Starting Suite E ===');
  const results: ChatMemoryTestResult[] = [];
  const mem = new MemoryStorage();

  // 1. Thread Creation & Title Derivation
  try {
    const thread = makeEmptyThread();
    thread.messages.push({
      id: 'm1',
      role: 'user',
      content: 'What is the current fee for Fiqh 2 class?',
    });
    const title = deriveThreadTitle(thread.messages);
    const pass = title.includes('What is the current fee');
    results.push({
      id: 'MEM-01',
      name: 'Dynamic Conversation Thread Title Derivation',
      passed: pass,
      details: pass ? `Generated clean title: "${title}"` : `Failed title: ${title}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'MEM-01',
      name: 'Dynamic Conversation Thread Title Derivation',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Strict Per-User Storage Key Isolation
  try {
    const userA = 'student:S0125';
    const userB = 'manager:jaseel';
    const threadA = makeEmptyThread('Student Thread A');
    const threadB = makeEmptyThread('Manager Thread B');

    saveUserThreads('khazna-ledger', userA, [threadA], threadA.id, mem);
    saveUserThreads('khazna-ledger', userB, [threadB], threadB.id, mem);

    const loadedA = loadUserThreads('khazna-ledger', userA, mem);
    const loadedB = loadUserThreads('khazna-ledger', userB, mem);

    const pass =
      loadedA.threads.length === 1 &&
      loadedA.threads[0].title === 'Student Thread A' &&
      loadedB.threads.length === 1 &&
      loadedB.threads[0].title === 'Manager Thread B' &&
      !loadedA.threads.some((t) => t.title === 'Manager Thread B');

    results.push({
      id: 'MEM-02',
      name: 'Multi-User Conversation Thread Isolation (Zero Leakage)',
      passed: pass,
      details: pass ? 'User A and User B thread histories strictly isolated' : 'LEAK DETECTED between user thread stores',
    });
  } catch (err: unknown) {
    results.push({
      id: 'MEM-02',
      name: 'Multi-User Conversation Thread Isolation (Zero Leakage)',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Personalization Settings Storage & Retrieval
  try {
    const userKey = 'admin:principal';
    const prefs = {
      displayName: 'Principal Abdulla',
      tone: 'concise' as const,
      preferredLanguage: 'ml' as const,
      customInstructions: 'Always answer in bullet points with INR currency',
      voiceAutoSend: true,
    };

    saveUserPersonalization('khazna-ledger', userKey, prefs, mem);
    const loaded = loadUserPersonalization('khazna-ledger', userKey, mem);

    const pass =
      loaded.displayName === 'Principal Abdulla' &&
      loaded.tone === 'concise' &&
      loaded.preferredLanguage === 'ml' &&
      loaded.voiceAutoSend === true;

    results.push({
      id: 'MEM-03',
      name: 'User Personalization Preferences Persistence',
      passed: pass,
      details: pass ? 'Persisted and reloaded user preference profile' : 'Failed to save or reload preferences',
    });
  } catch (err: unknown) {
    results.push({
      id: 'MEM-03',
      name: 'User Personalization Preferences Persistence',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Clear Memory Wipes Active User Storage Cleanly
  try {
    const userKey = 'student:wipe_test';
    const thread = makeEmptyThread('Ephemeral Thread');
    saveUserThreads('khazna-ledger', userKey, [thread], thread.id, mem);

    // Wipe by writing clean thread
    const cleanThread = makeEmptyThread();
    saveUserThreads('khazna-ledger', userKey, [cleanThread], cleanThread.id, mem);
    const reloaded = loadUserThreads('khazna-ledger', userKey, mem);

    const pass = reloaded.threads.length === 1 && reloaded.threads[0].title === 'New conversation';
    results.push({
      id: 'MEM-04',
      name: 'Clear All User Threads & Clean Reset',
      passed: pass,
      details: pass ? 'Successfully wiped user conversations and reset to single clean thread' : 'Failed to wipe storage cleanly',
    });
  } catch (err: unknown) {
    results.push({
      id: 'MEM-04',
      name: 'Clear All User Threads & Clean Reset',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  const reportPath = path.join(LOG_DIR, 'chat_memory_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`✓ Chat Memory Agent finished. Results saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('agentChatMemory.ts')) {
  runChatMemoryAgent().then((res) => {
    const passed = res.filter((r) => r.passed).length;
    console.log(`Chat Memory Summary: ${passed}/${res.length} passed.`);
    process.exit(passed === res.length ? 0 : 1);
  });
}
