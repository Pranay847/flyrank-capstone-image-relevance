import { json, parse } from './db.js';

const SUBJECTS = ['red fox', 'gray wolf', 'domestic dog', 'brown bear', 'white-tailed deer'];
const ALIASES = new Map([
  ['vulpes', 'fox'], ['vulpes vulpes', 'fox'], ['foxes', 'fox'], ['red fox', 'fox'],
  ['wolves', 'wolf'], ['gray wolf', 'wolf'], ['canis lupus', 'wolf'],
  ['dogs', 'dog'], ['canine companion', 'dog'], ['domestic dog', 'dog'],
  ['bears', 'bear'], ['brown bear', 'bear'], ['ursus arctos', 'bear'],
  ['deer', 'deer'], ['white-tailed deer', 'deer'], ['odocoileus', 'deer']
]);

export function validateMetadata(value) {
  const ok = value && typeof value.subject === 'string' && typeof value.category === 'string' &&
    Array.isArray(value.attributes) && value.attributes.every(x => typeof x === 'string') &&
    typeof value.caption === 'string' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1;
  if (!ok) throw Object.assign(new Error('vision output failed schema validation'), { status: 422 });
  return value;
}

export class FixtureVisionProvider {
  async classify(image) {
    if (image.filename.includes('invalid')) return { prose: 'not structured' };
    const subject = image.expected_subject;
    const confidence = image.filename.includes('uncertain') ? 0.42 : 0.94;
    return {
      subject, category: 'animal', attributes: [subject.split(' ').at(-1), 'wildlife', 'outdoors'],
      caption: `A ${subject} in a natural habitat`, confidence
    };
  }
}

function tokens(text) {
  let normalized = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  for (const [from, to] of ALIASES) normalized = normalized.replaceAll(from, to);
  return normalized.split(/\s+/).filter(Boolean);
}

export function embed(text) {
  const dimensions = 48;
  const vector = Array(dimensions).fill(0);
  for (const token of tokens(text)) {
    let hash = 2166136261;
    for (const char of token) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    vector[Math.abs(hash) % dimensions] += 1;
  }
  const norm = Math.sqrt(vector.reduce((n, x) => n + x * x, 0)) || 1;
  return vector.map(x => x / norm);
}

export function cosine(a, b) {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

function canonicalSubject(text) {
  const source = text.toLowerCase();
  for (const [alias, canonical] of ALIASES) if (source.includes(alias)) return canonical;
  return null;
}

export function guard(post, metadata, score, thresholds = { similarity: 0.2, confidence: 0.6 }) {
  if (metadata.confidence < thresholds.confidence) return { accepted: false, reason: 'classification confidence below threshold' };
  const expected = canonicalSubject(`${post.title} ${post.body}`);
  const detected = canonicalSubject(metadata.subject);
  if (!expected) return { accepted: false, reason: 'post subject is outside the supported corpus' };
  if (expected && detected && expected !== detected) return { accepted: false, reason: `animal category mismatch: expected ${expected}, detected ${detected}` };
  if (score < thresholds.similarity) return { accepted: false, reason: 'semantic similarity below threshold' };
  return { accepted: true, reason: 'subject and semantic thresholds passed' };
}

export class ImageService {
  constructor(db, provider = new FixtureVisionProvider(), budget = 100000) { this.db = db; this.provider = provider; this.budget = budget; }

  queue(tenant, key) {
    this.db.prepare(`INSERT OR IGNORE INTO jobs(tenant_id,type,idempotency_key,created_at) VALUES(?,?,?,?)`).run(tenant, 'classify', key, new Date().toISOString());
    return this.db.prepare('SELECT * FROM jobs WHERE idempotency_key=?').get(key);
  }

  async run(jobId, tenant) {
    const job = this.db.prepare('SELECT * FROM jobs WHERE id=? AND tenant_id=?').get(jobId, tenant);
    if (!job) throw Object.assign(new Error('job not found'), { status: 404 });
    if (job.state === 'completed') return job;
    this.db.prepare(`UPDATE jobs SET state='running', attempts=attempts+1 WHERE id=?`).run(jobId);
    const images = this.db.prepare(`SELECT * FROM images WHERE tenant_id=? AND state='pending'`).all(tenant);
    let done = 0;
    for (const image of images) {
      try {
        const metadata = validateMetadata(await this.provider.classify(image));
        const state = metadata.confidence < 0.6 ? 'flagged' : 'ready';
        this.db.prepare('UPDATE images SET metadata_json=?,confidence=?,state=?,embedding_json=? WHERE id=?')
          .run(json(metadata), metadata.confidence, state, json(embed(metadata.caption + ' ' + metadata.attributes.join(' '))), image.id);
        this.db.prepare('INSERT INTO costs(tenant_id,operation,resource_id,units,microcents,created_at) VALUES(?,?,?,?,?,?)')
          .run(tenant, 'vision.classify', image.id, 1, 25, new Date().toISOString());
        done += 1;
      } catch (error) {
        this.db.prepare(`UPDATE images SET state='flagged' WHERE id=?`).run(image.id);
      }
    }
    const totalCost = this.db.prepare('SELECT COALESCE(SUM(microcents),0) total FROM costs WHERE tenant_id=?').get(tenant).total;
    const alert = totalCost > this.budget ? 'vision budget exceeded' : null;
    this.db.prepare(`UPDATE jobs SET state='completed',progress=100,alert=? WHERE id=?`).run(alert, jobId);
    return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  }

  createPost(tenant, input) {
    if (typeof input?.title !== 'string' || typeof input?.body !== 'string' || !input.title.trim() || !input.body.trim()) throw Object.assign(new Error('title and body are required'), { status: 400 });
    const info = this.db.prepare('INSERT INTO posts(tenant_id,title,body,expected_subject,embedding_json) VALUES(?,?,?,?,?)')
      .run(tenant, input.title, input.body, canonicalSubject(`${input.title} ${input.body}`), json(embed(`${input.title} ${input.body}`)));
    this.db.prepare('INSERT INTO costs(tenant_id,operation,resource_id,units,microcents,created_at) VALUES(?,?,?,?,?,?)')
      .run(tenant, 'embedding.post', Number(info.lastInsertRowid), tokens(`${input.title} ${input.body}`).length, 1, new Date().toISOString());
    return this.db.prepare('SELECT * FROM posts WHERE id=?').get(Number(info.lastInsertRowid));
  }

  suggest(tenant, postId, forceImageId) {
    const post = this.db.prepare('SELECT * FROM posts WHERE id=? AND tenant_id=?').get(postId, tenant);
    if (!post) throw Object.assign(new Error('post not found'), { status: 404 });
    let images = this.db.prepare(`SELECT * FROM images WHERE tenant_id=? AND state IN ('ready','flagged')`).all(tenant);
    if (forceImageId) images = images.filter(x => x.id === Number(forceImageId));
    const ranked = images.map(image => {
      const score = cosine(parse(post.embedding_json), parse(image.embedding_json));
      const result = guard(post, parse(image.metadata_json), score);
      return { image, score, ...result };
    }).sort((a, b) => b.score - a.score);
    const accepted = ranked.filter(x => x.accepted);
    if (!accepted.length) return { status: 'no confident match', reasons: [...new Set(ranked.slice(0, 3).map(x => x.reason))], candidates: ranked.slice(0, 3).map(format) };
    const top = accepted[0];
    this.db.prepare(`INSERT INTO suggestions(tenant_id,post_id,image_id,score,decision,reason) VALUES(?,?,?,?,?,?)
      ON CONFLICT(tenant_id,post_id,image_id) DO UPDATE SET score=excluded.score,decision=excluded.decision,reason=excluded.reason`)
      .run(tenant, post.id, top.image.id, top.score, 'suggested', top.reason);
    return { status: 'suggested', candidates: ranked.slice(0, 5).map(format) };
  }

  review(tenant, suggestionId, status) {
    if (!['approved', 'rejected'].includes(status)) throw Object.assign(new Error('status must be approved or rejected'), { status: 400 });
    const result = this.db.prepare('UPDATE suggestions SET review_status=? WHERE id=? AND tenant_id=?').run(status, suggestionId, tenant);
    if (!result.changes) throw Object.assign(new Error('suggestion not found'), { status: 404 });
    return this.db.prepare('SELECT * FROM suggestions WHERE id=?').get(suggestionId);
  }
}

function format(item) {
  return { image_id: item.image.id, filename: item.image.filename, subject: parse(item.image.metadata_json)?.subject, score: Number(item.score.toFixed(4)), accepted: item.accepted, reason: item.reason };
}

export { SUBJECTS };
