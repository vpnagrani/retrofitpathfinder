import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export class Database {
  constructor(file = process.env.DB_FILE || 'data/pathfinder.sqlite') {
    this.postgres = Boolean(process.env.DATABASE_URL || process.env.PGHOST);
    this.context = new AsyncLocalStorage();
    this.queue = Promise.resolve();
    if (this.postgres) this.pool = new pg.Pool({ ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}), max: 5 });
    else {
      mkdirSync(path.dirname(file), { recursive: true });
      this.sqlite = new DatabaseSync(file);
      this.sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    }
  }
  async query(sql, params = []) {
    if (!this.postgres && !this.context.getStore()) return this.serial(() => this.context.run(true, () => this.query(sql, params)));
    if (this.postgres) {
      let i = 0;
      const result = await (this.context.getStore() || this.pool).query(sql.replace(/\?/g, () => `$${++i}`), params);
      return result.rows;
    }
    const stmt = this.sqlite.prepare(sql);
    return stmt.columns().length ? stmt.all(...params) : (stmt.run(...params), []);
  }
  async serial(fn) {
    const old = this.queue;
    let release;
    this.queue = new Promise(resolve => { release = resolve; });
    await old;
    try { return await fn(); } finally { release(); }
  }
  async one(sql, params = []) { return (await this.query(sql, params))[0]; }
  async transaction(fn) {
    if (this.context.getStore()) return fn(this);
    if (!this.postgres) return this.serial(() => this.context.run(true, async () => {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try { const result = await fn(this); this.sqlite.exec('COMMIT'); return result; }
      catch (e) { this.sqlite.exec('ROLLBACK'); throw e; }
    }));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.context.run(client, () => fn(this));
      await client.query('COMMIT'); return result;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  async init() {
    if (this.postgres) await this.query('CREATE EXTENSION IF NOT EXISTS vector');
    const statements = [
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, expires_at TEXT NOT NULL, created_by TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, adviser_id TEXT REFERENCES users(id) ON DELETE SET NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deletion_requested_at TEXT)',
      'CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, evidence TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, version INTEGER NOT NULL, snapshot TEXT NOT NULL, pdf TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(profile_id,version))',
      'CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL, retrieved_at TEXT NOT NULL, checked_at TEXT NOT NULL, kind TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)',
      `CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE, body TEXT NOT NULL, embedding ${this.postgres ? 'vector(1536)' : 'TEXT'}, model TEXT)`,
      'CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS job_locks (name TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS profiles_owner ON profiles(owner_id)',
      'CREATE INDEX IF NOT EXISTS messages_profile ON messages(profile_id,created_at)',
      'CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_id)',
      'CREATE INDEX IF NOT EXISTS source_active ON sources(active,url)'
    ];
    for (const sql of statements) await this.query(sql);
    if (this.postgres) await this.query('CREATE INDEX IF NOT EXISTS chunks_cosine ON chunks USING hnsw (embedding vector_cosine_ops)');
    for (const [key,value] of [['retention_days',process.env.RETENTION_DAYS || '365'], ['audit_retention_days',process.env.AUDIT_RETENTION_DAYS || '730']]) {
      await this.query('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING',[key,value]);
    }
  }
  async close() { if (this.pool) await this.pool.end(); else this.sqlite.close(); }
}
