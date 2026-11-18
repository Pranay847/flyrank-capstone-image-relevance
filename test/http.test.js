import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function withServer(fn) {
  const { server, db } = createApp({ token: 't' });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { authorization: 'Bearer t', 'x-tenant-id': 'a', 'content-type': 'application/json', ...init.headers } });
  try { await fn(call, db); } finally { server.close(); }
}

test('non-object JSON bodies are 400, not 500', () => withServer(async (call, db) => {
  for (const raw of ['null', '[]', '42', '"approved"']) {
    const review = await call('/api/suggestions/1/review', { method: 'POST', body: raw });
    assert.equal(review.status, 400, `review ${raw}`);
    assert.match((await review.json()).error, /must be an object/);
    const post = await call('/api/posts', { method: 'POST', body: raw });
    assert.equal(post.status, 400, `post ${raw}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n, 0);
}));

test('createPost rejects non-string or blank title/body without storing', () => withServer(async (call, db) => {
  for (const input of [{ title: { x: 1 }, body: 'b' }, { title: 'fox', body: 7 }, { title: '   ', body: 'b' }, { title: 'fox', body: '' }]) {
    const res = await call('/api/posts', { method: 'POST', body: JSON.stringify(input) });
    assert.equal(res.status, 400, JSON.stringify(input));
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM costs').get().n, 0);
  const ok = await call('/api/posts', { method: 'POST', body: JSON.stringify({ title: 'Red fox', body: 'Vulpes vulpes' }) });
  assert.equal(ok.status, 201);
}));
