import http from 'node:http';
import { openDatabase } from './db.js';
import { ImageService } from './domain.js';

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 32768) throw Object.assign(new Error('body too large'), { status: 413 }); }
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('JSON body must be an object'), { status: 400 });
  return parsed;
}

export function createApp(options = {}) {
  const db = options.db || openDatabase(options.databasePath || process.env.DATABASE_PATH || ':memory:');
  const service = options.service || new ImageService(db);
  const token = options.token || process.env.AUTH_TOKEN || 'reviewer-demo-token';
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'image-relevance' });
      if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized', request_id: requestId });
      const tenant = req.headers['x-tenant-id'];
      if (!tenant) return send(res, 400, { error: 'x-tenant-id is required', request_id: requestId });
      if (req.method === 'POST' && url.pathname === '/api/jobs/process') {
        const key = req.headers['idempotency-key'];
        if (!key) return send(res, 400, { error: 'idempotency-key is required' });
        return send(res, 202, service.queue(tenant, key));
      }
      let match = url.pathname.match(/^\/api\/jobs\/(\d+)\/run$/);
      if (req.method === 'POST' && match) return send(res, 200, await service.run(Number(match[1]), tenant));
      if (req.method === 'POST' && url.pathname === '/api/posts') return send(res, 201, service.createPost(tenant, await body(req)));
      match = url.pathname.match(/^\/api\/posts\/(\d+)\/images$/);
      if (req.method === 'GET' && match) return send(res, 200, service.suggest(tenant, Number(match[1]), url.searchParams.get('force_image_id')));
      match = url.pathname.match(/^\/api\/suggestions\/(\d+)\/review$/);
      if (req.method === 'POST' && match) return send(res, 200, service.review(tenant, Number(match[1]), (await body(req)).status));
      if (req.method === 'GET' && url.pathname === '/api/costs') return send(res, 200, db.prepare('SELECT * FROM costs WHERE tenant_id=? ORDER BY id').all(tenant));
      return send(res, 404, { error: 'not found', request_id: requestId });
    } catch (error) { return send(res, error.status || 500, { error: error.status ? error.message : 'internal error', request_id: requestId }); }
  });
  return { server, db, service };
}
