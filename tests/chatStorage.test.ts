import { describe, expect, it } from 'vitest';
import {
  clearThreadsList,
  createThreadInList,
  deleteThreadFromList,
  loadUserPersonalization,
  loadUserThreads,
  renameThreadInList,
  saveUserPersonalization,
  saveUserThreads,
  upsertThreadMessagesInList,
  type StorageLike,
} from '../packages/widget/src/hooks/useChatStorage.ts';

function makeMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('Per-user chat history CRUD & personalization storage', () => {
  it('isolates chat history CRUD cleanly across different user keys', () => {
    const mem = makeMemoryStorage();
    const userA = 'demo:admin:admin@islahululoom.edu';
    const userB = 'demo:student:S0125';

    const initA = loadUserThreads('khazna-ledger', userA, mem);
    expect(initA.threads.length).toBe(1);

    const updatedMsgsA = upsertThreadMessagesInList(initA.threads, initA.activeThreadId, [
      { id: 'u1', role: 'user', content: 'Download Class Report PDF' },
      { id: 'a1', role: 'assistant', content: 'Downloading PDF report now.' },
    ]);
    expect(updatedMsgsA[0].title).toBe('Download Class Report PDF');

    const createdA = createThreadInList(updatedMsgsA);
    expect(createdA.threads.length).toBe(2);

    const renamedA = renameThreadInList(createdA.threads, initA.activeThreadId, 'Monthly Audit Export');
    expect(renamedA.find((t) => t.id === initA.activeThreadId)?.title).toBe('Monthly Audit Export');
    saveUserThreads('khazna-ledger', userA, renamedA, createdA.activeThreadId, mem);

    const initB = loadUserThreads('khazna-ledger', userB, mem);
    expect(initB.threads.length).toBe(1);
    expect(initB.threads[0].messages.length).toBe(0);

    const loadedA = loadUserThreads('khazna-ledger', userA, mem);
    expect(loadedA.threads.length).toBe(2);

    const afterDeleteA = deleteThreadFromList(
      loadedA.threads,
      initA.activeThreadId,
      loadedA.activeThreadId
    );
    expect(afterDeleteA.threads.length).toBe(1);

    const afterClearA = clearThreadsList();
    expect(afterClearA.threads.length).toBe(1);
    expect(afterClearA.threads[0].messages.length).toBe(0);
  });

  it('isolates personalization settings per user key', () => {
    const mem = makeMemoryStorage();
    const adminKey = 'demo:admin:admin@islahululoom.edu';
    const studentKey = 'demo:student:S0125';

    saveUserPersonalization(
      'khazna-ledger',
      adminKey,
      {
        displayName: 'Principal',
        tone: 'concise',
        preferredLanguage: 'en',
        customInstructions: 'Show totals first',
        voiceAutoSend: true,
      },
      mem
    );

    saveUserPersonalization(
      'khazna-ledger',
      studentKey,
      {
        displayName: 'Safwan',
        tone: 'detailed',
        preferredLanguage: 'ml',
        customInstructions: 'Explain my sector balance in Malayalam',
        voiceAutoSend: false,
      },
      mem
    );

    const adminPrefs = loadUserPersonalization('khazna-ledger', adminKey, mem);
    const studentPrefs = loadUserPersonalization('khazna-ledger', studentKey, mem);

    expect(adminPrefs.displayName).toBe('Principal');
    expect(adminPrefs.tone).toBe('concise');
    expect(adminPrefs.voiceAutoSend).toBe(true);

    expect(studentPrefs.displayName).toBe('Safwan');
    expect(studentPrefs.tone).toBe('detailed');
    expect(studentPrefs.preferredLanguage).toBe('ml');
    expect(studentPrefs.voiceAutoSend).toBe(false);
  });

  it('guarantees complete isolation across Super Admin, Multiple Admins, Sector Managers, and Students', () => {
    const mem = makeMemoryStorage();

    // 1. Define distinct user keys across the entire organizational hierarchy
    const superAdminKey = 'platform:super_admin:superadmin@khaznacampus.platform';
    const adminCollegeA = 'org-islahul:admin:admin@islahululoom.edu';
    const adminCollegeB = 'org-alfarooq:admin:admin@alfarooq.edu';
    const admin2CollegeA = 'org-islahul:admin:bursar@islahululoom.edu';

    const managerFiqh = 'org-islahul:manager:dept-fiqh:M04';
    const managerOffice = 'org-islahul:manager:office:M01';
    const managerUnion = 'org-islahul:manager:ihsan-union:M02';

    const studentSafwan = 'org-islahul:student:S0125';
    const studentNihal = 'org-islahul:student:S0126';

    const allKeys = [
      superAdminKey,
      adminCollegeA,
      adminCollegeB,
      admin2CollegeA,
      managerFiqh,
      managerOffice,
      managerUnion,
      studentSafwan,
      studentNihal,
    ];

    // 2. Each user initiates an isolated conversation with unique confidential messages
    const secretMessages: Record<string, string> = {
      [superAdminKey]: 'Super Admin: Platform global audit across all colleges',
      [adminCollegeA]: 'Admin A: Annual budget review for Islahul Uloom',
      [adminCollegeB]: 'Admin B: Campus founding finances for Al-Farooq Academy',
      [admin2CollegeA]: 'Bursar A: Ledger reconciliation and salary disbursements',
      [managerFiqh]: 'Fiqh Manager (M04): Fiqh 2 study tour fees collection',
      [managerOffice]: 'Office Manager (M01): Administrative cash deposits batch',
      [managerUnion]: 'Union Manager (M02): Ihsan Union relief fund ledger',
      [studentSafwan]: 'Safwan (S0125): How much do I owe in Fiqh sector?',
      [studentNihal]: 'Nihal (S0126): Download statement for admission S0126',
    };

    allKeys.forEach((key) => {
      const init = loadUserThreads('khazna-ledger', key, mem);
      expect(init.threads.length).toBe(1);
      const text = secretMessages[key];
      const updated = upsertThreadMessagesInList(init.threads, init.activeThreadId, [
        { id: `u_${key}`, role: 'user', content: text },
        { id: `a_${key}`, role: 'assistant', content: `Confidential reply for ${key}` },
      ]);
      saveUserThreads('khazna-ledger', key, updated, init.activeThreadId, mem);
    });

    // 3. Verify strict isolation: reading any user's history returns ONLY their own messages
    allKeys.forEach((key) => {
      const loaded = loadUserThreads('khazna-ledger', key, mem);
      expect(loaded.threads.length).toBe(1);
      expect(loaded.threads[0].messages.length).toBe(2);
      expect(loaded.threads[0].messages[0].content).toBe(secretMessages[key]);

      // Verify no other user's confidential message leaked into this user's history
      allKeys
        .filter((other) => other !== key)
        .forEach((other) => {
          const leaked = loaded.threads[0].messages.some((m) =>
            m.content.includes(secretMessages[other])
          );
          expect(leaked).toBe(false);
        });
    });

    // 4. Verify Super Admin vs Multiple Admins isolation
    const loadedSuperAdmin = loadUserThreads('khazna-ledger', superAdminKey, mem);
    const loadedAdminA = loadUserThreads('khazna-ledger', adminCollegeA, mem);
    const loadedAdminB = loadUserThreads('khazna-ledger', adminCollegeB, mem);
    expect(loadedSuperAdmin.threads[0].messages[0].content).not.toBe(
      loadedAdminA.threads[0].messages[0].content
    );
    expect(loadedAdminA.threads[0].messages[0].content).not.toBe(
      loadedAdminB.threads[0].messages[0].content
    );

    // 5. Verify Sector Managers under Admin are isolated from Admin and from each other
    const loadedFiqh = loadUserThreads('khazna-ledger', managerFiqh, mem);
    const loadedOffice = loadUserThreads('khazna-ledger', managerOffice, mem);
    expect(loadedFiqh.threads[0].messages[0].content).not.toBe(
      loadedAdminA.threads[0].messages[0].content
    );
    expect(loadedFiqh.threads[0].messages[0].content).not.toBe(
      loadedOffice.threads[0].messages[0].content
    );

    // 6. Verify Students are isolated from managers, admins, and each other
    const loadedSafwan = loadUserThreads('khazna-ledger', studentSafwan, mem);
    const loadedNihal = loadUserThreads('khazna-ledger', studentNihal, mem);
    expect(loadedSafwan.threads[0].messages[0].content).not.toBe(
      loadedNihal.threads[0].messages[0].content
    );
    expect(loadedSafwan.threads[0].messages[0].content).not.toBe(
      loadedFiqh.threads[0].messages[0].content
    );
  });
});
