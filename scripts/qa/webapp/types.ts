import type { Page } from 'playwright-core';

export interface WebappTestResult {
  id: string;
  suite: string;
  name: string;
  role: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

export interface PageErrorBucket {
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: Array<{ url: string; status: number }>;
  dialogTriggered: string[];
}

export function attachErrorListeners(
  page: Page,
  options?: { allowStatusesForUrls?: Array<{ urlIncludes: string; status: number }> }
): PageErrorBucket {
  const bucket: PageErrorBucket = {
    consoleErrors: [],
    pageErrors: [],
    failedResponses: [],
    dialogTriggered: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore intentional negative-test 401/403 logs or HMR websocket warnings
      if (txt.includes('WebSocket')) return;
      bucket.consoleErrors.push(txt);
    }
  });

  page.on('pageerror', (err) => {
    bucket.pageErrors.push(err.message);
  });

  page.on('dialog', (dialog) => {
    bucket.dialogTriggered.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) {
      const url = res.url();
      const allowed = options?.allowStatusesForUrls?.some(
        (a) => url.includes(a.urlIncludes) && a.status === status
      );
      if (!allowed && !url.includes('favicon.ico')) {
        bucket.failedResponses.push({ url, status });
      }
    }
  });

  return bucket;
}

export function formatBucketErrors(bucket: PageErrorBucket): string {
  const parts: string[] = [];
  if (bucket.consoleErrors.length) parts.push(`consoleErrors=${bucket.consoleErrors.length} (${bucket.consoleErrors[0]})`);
  if (bucket.pageErrors.length) parts.push(`pageErrors=${bucket.pageErrors.length} (${bucket.pageErrors[0]})`);
  if (bucket.failedResponses.length) {
    parts.push(`httpErrors=${bucket.failedResponses.length} (${bucket.failedResponses[0]?.status} ${bucket.failedResponses[0]?.url})`);
  }
  if (bucket.dialogTriggered.length) parts.push(`nativeDialogs=${bucket.dialogTriggered.length} (${bucket.dialogTriggered[0]})`);
  return parts.join('; ');
}
