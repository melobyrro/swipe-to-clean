import http from 'node:http';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { AssetStub } from '../../shared/contracts';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WwWSn0AAAAASUVORK5CYII=',
  'base64'
);

type SearchMap = Record<string, AssetStub[]>;

export async function startMockImmichServer(options?: {
  searchResults?: SearchMap;
  validApiKey?: string;
  loginEmail?: string;
  loginPassword?: string;
  failDeleteIds?: string[];
}) {
  const app = express();
  app.use(express.json());

  const validApiKey = options?.validApiKey ?? 'good-key';
  const loginEmail = options?.loginEmail ?? 'immich@example.com';
  const loginPassword = options?.loginPassword ?? 'password123';
  const failDeleteIds = new Set(options?.failDeleteIds ?? []);
  const searchResults = options?.searchResults ?? {};

  function isAuthorized(req: express.Request) {
    return req.header('x-api-key') === validApiKey || req.header('authorization') === 'Bearer access-token';
  }

  app.post('/api/auth/validateToken', (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    res.json({ authStatus: true });
  });

  app.post('/api/auth/login', (req, res) => {
    if (req.body.email !== loginEmail || req.body.password !== loginPassword) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    res.json({ accessToken: 'access-token' });
  });

  app.post('/api/search/metadata', (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const page = Number(req.body.page ?? 1);
    const size = Number(req.body.size ?? 1000);
    const key = `${req.body.takenAfter}|${req.body.takenBefore}`;
    const items = searchResults[key] ?? [];
    const start = (page - 1) * size;
    const pagedItems = items.slice(start, start + size);

    res.json({
      assets: {
        total: items.length,
        count: pagedItems.length,
        items: pagedItems
      }
    });
  });

  app.delete('/api/assets', (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const ids = Array.isArray(req.body.ids) ? (req.body.ids as string[]) : [];
    if (ids.some((id) => failDeleteIds.has(id))) {
      res.status(500).json({ message: 'Immich delete failed' });
      return;
    }

    res.status(204).end();
  });

  app.get('/api/assets/:id/thumbnail', (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    res.setHeader('content-type', 'image/png');
    res.send(PNG_BYTES);
  });

  app.get('/api/assets/:id/original', (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    res.setHeader('content-type', req.params.id.includes('video') ? 'video/mp4' : 'image/jpeg');
    res.send(Buffer.from('mock-original'));
  });

  const server = await new Promise<http.Server>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}
