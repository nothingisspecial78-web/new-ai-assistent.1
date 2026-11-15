import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { createAssistantRuntime, mountAssistantRoutes, type AssistantRuntime } from '../packages/server/src/index.ts';
import { createCollegeFinanceRouter } from '../apps/demo-college-finance/server.ts';
import { createLibraryRouter } from '../apps/second-demo-app/server.ts';

let appInstance: express.Express | null = null;
let initPromise: Promise<express.Express> | null = null;

async function getOrCreateApp(): Promise<express.Express> {
  if (appInstance) return appInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const app = express();

      app.use(
        helmet({
          contentSecurityPolicy: false,
          crossOriginEmbedderPolicy: false,
        })
      );
      app.use(express.json({ limit: '10mb' }));

      // 1. Mount Demo Apps APIs
      app.use('/api/demo/college-finance', createCollegeFinanceRouter());
      app.use('/api/demo/second-demo', createLibraryRouter());

      // 2. Initialize and Mount Assistant Runtime
      const profilesDir = path.resolve(process.cwd(), 'profiles');
      const runtime = await createAssistantRuntime({
        port: 3000,
        profilesDir,
      });
      mountAssistantRoutes(app, runtime);

      // 3. Fallback error handler
      app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
        const message = err instanceof Error ? err.message : 'Internal Server Error';
        res.status(500).json({ error: 'Server Error', details: message });
      });

      appInstance = app;
      return app;
    })();
  }
  return initPromise;
}

export default async function handler(req: Request, res: Response) {
  try {
    const app = await getOrCreateApp();
    return app(req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: 'Failed to initialize serverless assistant runtime',
      details: message,
    });
  }
}
