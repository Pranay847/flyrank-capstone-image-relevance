import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { ImageService, cosine, embed, guard, validateMetadata } from '../src/domain.js';

const valid = { subject: 'red fox', category: 'animal', attributes: ['fox'], caption: 'A fox', confidence: 0.9 };
const rejects = (fn, status, pattern) => assert.throws(fn, err => err.status === status && pattern.test(err.message));

test('schema enforces confidence bounds and string attributes with 422', () => {
  assert.equal(validateMetadata(valid), valid);
  for (const bad of [{ confidence: 1.01 }, { confidence: -0.1 }, { confidence: NaN }, { attributes: ['ok', 3] }, { subject: undefined }]) {
    rejects(() => validateMetadata({ ...valid, ...bad }), 422, /schema validation/);
  }
  rejects(() => validateMetadata(null), 422, /schema validation/);
});

test('embed is unit length, empty text yields zero vector, and aliases converge', () => {
  const v = embed('red fox in the forest');
  assert.ok(Math.abs(cosine(v, v) - 1) < 1e-9);
  assert.ok(embed('').every(x => x === 0));
  assert.ok(Math.abs(cosine(embed('Vulpes vulpes'), embed('fox')) - 1) < 1e-9);
});

test('guard checks confidence, supported corpus, and similarity in order', () => {
  const post = { title: 'Red fox behavior', body: 'den sites' };
  const fox = { subject: 'red fox', confidence: 0.95 };
  assert.match(guard(post, { ...fox, confidence: 0.59 }, 0.9).reason, /confidence below threshold/);
  assert.match(guard({ title: 'Quantum', body: 'photons' }, fox, 0.9).reason, /outside the supported corpus/);
  assert.match(guard(post, fox, 0.19).reason, /similarity below threshold/);
  assert.deepEqual(guard(post, fox, 0.2), { accepted: true, reason: 'subject and semantic thresholds passed' });
  assert.equal(guard(post, { subject: 'unknown critter', confidence: 0.95 }, 0.5).accepted, true);
});

test('service input guards return 400/404 and stay tenant-scoped', async () => {
  const service = new ImageService(openDatabase());
  rejects(() => service.createPost('demo', { title: 'Fox' }), 400, /title and body/);
  rejects(() => service.createPost('demo', undefined), 400, /title and body/);
  const post = service.createPost('demo', { title: 'Fox', body: 'red fox' });
  rejects(() => service.suggest('other', post.id), 404, /post not found/);
  rejects(() => service.review('demo', 1, 'pending'), 400, /approved or rejected/);
  rejects(() => service.review('demo', 999, 'approved'), 404, /suggestion not found/);
  const job = service.queue('demo', 'k1');
  await assert.rejects(service.run(job.id, 'other'), err => err.status === 404);
  assert.equal((await service.run(job.id, 'demo')).state, 'completed');
});
