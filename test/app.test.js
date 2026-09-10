import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { ImageService, guard, validateMetadata } from '../src/domain.js';
import { seed } from '../src/seed.js';

async function ready() {
  const db = openDatabase(); seed(db);
  const service = new ImageService(db);
  const job = service.queue('demo', 'seed-process');
  await service.run(job.id, 'demo');
  for (const post of db.prepare('SELECT * FROM posts').all()) service.createPost('eval', { title: post.title, body: post.body });
  return { db, service };
}

test('schema rejects invalid vision output', () => assert.throws(() => validateMetadata({ caption: 'free text' }), /schema validation/));

test('batch classifies 45 images, flags uncertainty, and records costs', async () => {
  const { db } = await ready();
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM images WHERE state IN ('ready','flagged')`).get().n, 45);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM images WHERE state='flagged'`).get().n, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM costs WHERE operation='vision.classify'`).get().n, 45);
});

test('semantic alias Vulpes vulpes ranks a fox first', async () => {
  const { service } = await ready();
  const post = service.createPost('demo', { title: 'Vulpes vulpes field guide', body: 'red fox wildlife behavior in forest' });
  const result = service.suggest('demo', post.id);
  assert.equal(result.status, 'suggested');
  assert.equal(result.candidates[0].subject, 'red fox');
});

test('mismatch guard rejects wolf on fox article with explanation', () => {
  const result = guard({ title: 'Red fox behavior', body: 'Vulpes vulpes' }, { subject: 'gray wolf', confidence: 0.95 }, 0.9);
  assert.equal(result.accepted, false);
  assert.match(result.reason, /expected fox, detected wolf/);
});

test('no matching subject returns no confident match', async () => {
  const { service } = await ready();
  const post = service.createPost('demo', { title: 'Quantum networking', body: 'Photons and entanglement in datacenters' });
  const result = service.suggest('demo', post.id);
  assert.equal(result.status, 'no confident match');
  assert.ok(result.reasons.length);
});

test('job enqueue is idempotent', async () => {
  const { service } = await ready();
  assert.equal(service.queue('demo', 'same').id, service.queue('demo', 'same').id);
});

test('labeled evaluation reaches perfect top-1 precision', async () => {
  const { db, service } = await ready();
  let correct = 0; const posts = db.prepare('SELECT * FROM posts WHERE tenant_id=?').all('demo');
  for (const post of posts) {
    db.prepare('UPDATE posts SET embedding_json=? WHERE id=?').run(JSON.stringify((await import('../src/domain.js')).embed(`${post.title} ${post.body}`)), post.id);
    const top = service.suggest('demo', post.id).candidates[0];
    if (top.subject === post.expected_subject) correct += 1;
  }
  assert.equal(correct / posts.length, 1);
});
