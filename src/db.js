import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, filename TEXT NOT NULL,
      expected_subject TEXT NOT NULL, metadata_json TEXT, confidence REAL,
      state TEXT NOT NULL DEFAULT 'pending', embedding_json TEXT,
      UNIQUE(tenant_id, filename)
    );
    CREATE INDEX IF NOT EXISTS idx_images_tenant_state ON images(tenant_id, state);
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, expected_subject TEXT, embedding_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_posts_tenant ON posts(tenant_id);
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, type TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3, progress INTEGER NOT NULL DEFAULT 0,
      alert TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS costs (
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, operation TEXT NOT NULL,
      resource_id INTEGER, units INTEGER NOT NULL, microcents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_costs_tenant ON costs(tenant_id);
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL, post_id INTEGER NOT NULL,
      image_id INTEGER, score REAL NOT NULL, decision TEXT NOT NULL,
      reason TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(tenant_id, post_id, image_id),
      FOREIGN KEY(post_id) REFERENCES posts(id), FOREIGN KEY(image_id) REFERENCES images(id)
    );
  `);
  return db;
}

export const json = (value) => JSON.stringify(value);
export const parse = (value) => value ? JSON.parse(value) : null;
