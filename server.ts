import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createAssistantRuntime, logger, mountAssistantRoutes } from '@ai-assistant/server';
import { createCollegeFinanceRouter } from './apps/demo-college-finance/server.ts';
import { createLibraryRouter } from './apps/second-demo-app/server.ts';

async function startServer() {
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  const app = express();
  app.use(compression());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: '10mb' }));

  // 1. Mount connected Demo Apps APIs
  app.use('/api/demo/college-finance', createCollegeFinanceRouter());
  app.use('/api/demo/second-demo', createLibraryRouter());

  // 2. Mount reusable AI Assistant Backend
  const runtime = await createAssistantRuntime({ port });
  mountAssistantRoutes(app, runtime);

  // 3. Serve standalone <script> widget bundle (/widget/assistant.js)
  const widgetDistDir = path.resolve(process.cwd(), 'packages/widget/dist');
  app.use(
    '/widget',
    express.static(widgetDistDir, {
      maxAge: '1d',
    })
  );

  // 4. Serve static public files (like /embed-demo.html)
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // 4.5. Redirect legacy /superadmin routes cleanly to /super-admin
  app.get('/superadmin', (_req, res) => res.redirect(302, '/super-admin'));
  app.get('/superadmin/login', (_req, res) => res.redirect(302, '/super-admin/login'));

  // 5. Mount Vite dev middleware or production static build
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    // High-performance immutable caching for fingerprinted assets
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    logger.info({ port, mode: isProd ? 'production' : 'development' }, 'Unified workspace server listening');
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
