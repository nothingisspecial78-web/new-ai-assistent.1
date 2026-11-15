import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AppProfile } from '@ai-assistant/core';
import { logger, type ServerConfig } from './config.ts';
import type { ProfileRegistry } from './profiles/loader.ts';
import { verifyScopeToken } from './security/scope.ts';

export interface AuthenticatedUser {
  userId: string;
  role: string;
  name?: string;
  rawToken: string;
}

export interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
  appProfile?: AppProfile;
}

export function resolveAppBaseUrl(baseUrl: string, serverPort: number): string {
  // In single-port container environments, allow localhost:3000 in profile.json to track actual server port
  return baseUrl.replace('http://localhost:3000', `http://127.0.0.1:${serverPort}`);
}

export async function verifyUserToken(params: {
  token: string;
  profile: AppProfile;
  cfg: ServerConfig;
}): Promise<AuthenticatedUser | null> {
  const { token, profile, cfg } = params;
  const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken) {
    if (profile.auth.mode === 'none') {
      return { userId: 'anonymous', role: 'viewer', rawToken: '' };
    }
    return null;
  }

  // 1. Structured demo token support (e.g. demo:ADMIN:user:sector:student:org)
  if (cleanToken.startsWith('demo:')) {
    const parts = cleanToken.split(':');
    const role = parts[1] || 'viewer';
    const userId = parts[2] || 'demo-user';
    return {
      userId,
      role,
      name: parts[2] || 'Demo User',
      rawToken: cleanToken,
    };
  }

  // 2. Signed Scope JWT token verification
  const scopeSecret =
    (profile.auth.jwtSecretEnv ? process.env[profile.auth.jwtSecretEnv] : undefined) ||
    cfg.jwtSecret;
  const verifiedScope = verifyScopeToken(cleanToken, scopeSecret);
  if (verifiedScope) {
    return {
      userId: verifiedScope.userId,
      role: verifiedScope.role,
      name: verifiedScope.userId,
      rawToken: cleanToken,
    };
  }

  // 3. JWT auth mode
  if (profile.auth.mode === 'jwt' || profile.auth.mode === 'hybrid') {
    try {
      const decoded = jwt.verify(cleanToken, scopeSecret) as Record<string, unknown>;
      const userId = String(decoded.sub || decoded.userId || decoded.id || '');
      if (userId) {
        return {
          userId,
          role: String(decoded.role || 'member'),
          name: decoded.name ? String(decoded.name) : undefined,
          rawToken: cleanToken,
        };
      }
    } catch {
      if (profile.auth.mode === 'jwt') {
        return null;
      }
    }
  }

  // 4. Me endpoint auth mode
  if ((profile.auth.mode === 'me' || profile.auth.mode === 'hybrid') && profile.api.meEndpoint) {
    try {
      const base = resolveAppBaseUrl(profile.api.baseUrl, cfg.port).replace(/\/$/, '');
      const endpoint = profile.api.meEndpoint.startsWith('/')
        ? profile.api.meEndpoint
        : `/${profile.api.meEndpoint}`;
      const res = await fetch(`${base}${endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'x-app-id': profile.appId,
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      const userId = String(data.userId || data.id || data.sub || '');
      if (!userId) return null;
      return {
        userId,
        role: String(data.role || 'member'),
        name: data.name ? String(data.name) : undefined,
        rawToken: cleanToken,
      };
    } catch (err) {
      logger.warn({ err, appId: profile.appId }, 'Profile /me token verification failed');
      return null;
    }
  }

  // 5. If profile auth mode is 'none', accept any non-empty token gracefully
  if (profile.auth.mode === 'none') {
    return {
      userId: 'anonymous',
      role: 'viewer',
      rawToken: cleanToken,
    };
  }

  return null;
}

export function createAuthMiddleware(profiles: ProfileRegistry, cfg: ServerConfig) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const appIdRaw =
      (req.body && typeof req.body.appId === 'string' && req.body.appId) ||
      (typeof req.query.appId === 'string' && req.query.appId) ||
      (typeof req.headers['x-app-id'] === 'string' && req.headers['x-app-id']) ||
      '';

    if (!appIdRaw) {
      res.status(400).json({ error: 'Missing required appId.' });
      return;
    }

    const profile = profiles.getProfile(appIdRaw);
    if (!profile) {
      res.status(404).json({ error: `Unknown appId "${appIdRaw}".` });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const user = await verifyUserToken({ token: authHeader, profile, cfg });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing authentication token.' });
      return;
    }

    req.appProfile = profile;
    req.authUser = user;
    next();
  };
}
