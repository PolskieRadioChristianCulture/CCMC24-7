import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export class Store {
  constructor(directory) {
    if (!directory || !isAbsolute(directory)) throw new Error('CC_DATA_DIR must be an absolute private directory outside the repository.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
    const offset = relative(repository, realpathSync(directory));
    if (!offset || (!offset.startsWith('..' + sep) && !isAbsolute(offset))) throw new Error('CC_DATA_DIR must be outside the repository to prevent publishing private memory.');
    const filename = join(directory, 'cc-memory.sqlite');
    this.db = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, kind TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
        source TEXT NOT NULL, observed_at TEXT NOT NULL, version INTEGER NOT NULL,
        updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_history (
        id TEXT NOT NULL, version INTEGER NOT NULL, snapshot TEXT NOT NULL,
        PRIMARY KEY (id, version));
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, completed_at TEXT, result TEXT);
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, task_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  search({ query = '', project, kind, limit = 30 } = {}) {
    // Literal substring search: '%' and '_' cannot expand the query.
    return this.db.prepare(`SELECT * FROM memory
      WHERE (? IS NULL OR project=?) AND (? IS NULL OR kind=?)
      AND instr(lower(title || ' ' || body), lower(?)) > 0
      ORDER BY updated_at DESC, id LIMIT ?`).all(project ?? null, project ?? null, kind ?? null, kind ?? null, query, limit);
  }
  upsert(record) {
    if (/AIza[\w-]{20,}|-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+/i.test([record.title, record.body, record.source].join(' '))) {
      throw new Error('SECRET_LIKE_CONTENT_REFUSED: do not store credentials in project memory.');
    }
    return this.transaction(() => {
      const current = this.db.prepare('SELECT * FROM memory WHERE id=?').get(record.id);
      if ((current?.version ?? 0) !== record.expectedVersion) throw new Error('VERSION_CONFLICT: read the current record before updating.');
      const next = {
        id: record.id, project: record.project, kind: record.kind, title: record.title,
        body: record.body, status: record.status, source: record.source,
        observed_at: record.observedAt, version: record.expectedVersion + 1,
        updated_at: new Date().toISOString()
      };
      this.db.prepare(`INSERT INTO memory VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET project=excluded.project, kind=excluded.kind,
        title=excluded.title, body=excluded.body, status=excluded.status,
        source=excluded.source, observed_at=excluded.observed_at,
        version=excluded.version, updated_at=excluded.updated_at`)
        .run(...Object.values(next));
      this.db.prepare('INSERT INTO memory_history VALUES (?, ?, ?)').run(next.id, next.version, JSON.stringify(next));
      return this.db.prepare('SELECT * FROM memory WHERE id=?').get(next.id);
    });
  }
  history(id) {
    return this.db.prepare('SELECT snapshot FROM memory_history WHERE id=? ORDER BY version').all(id).map(row => JSON.parse(row.snapshot));
  }
  enqueue({ idempotencyKey, title, body }) {
    const payload = JSON.stringify({ title, body });
    const fingerprint = createHash('sha256').update(payload).digest('hex');
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM tasks WHERE idem=?').get(idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: this key belongs to different content.');
        return this.task(existing.id);
      }
      const id = randomUUID();
      this.db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)')
        .run(id, idempotencyKey, fingerprint, 'prepare_lumina_draft', payload, 'QUEUED_LOCAL', new Date().toISOString());
      return this.task(id);
    });
  }
  task(id) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
    return row ? { ...row, payload: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null } : null;
  }
  tasks() { return this.db.prepare('SELECT id FROM tasks ORDER BY created_at DESC LIMIT 50').all().map(row => this.task(row.id)); }
  prepareDraft(taskId) {
    return this.transaction(() => {
      const task = this.task(taskId);
      if (!task) throw new Error('TASK_NOT_FOUND');
      if (task.status === 'COMPLETED_LOCAL') return task;
      if (task.status !== 'QUEUED_LOCAL' || task.kind !== 'prepare_lumina_draft') throw new Error('UNSUPPORTED_TASK');
      const id = randomUUID(), now = new Date().toISOString();
      this.db.prepare('INSERT INTO drafts VALUES (?, ?, ?, ?, ?)').run(id, taskId, task.payload.title, task.payload.body, now);
      const saved = this.db.prepare('SELECT id FROM drafts WHERE id=?').get(id);
      if (!saved) throw new Error('DRAFT_WRITE_NOT_VERIFIED');
      const result = { draftId: id, scope: 'LOCAL_ONLY', published: false, evidence: `sqlite:drafts:${id}` };
      this.db.prepare('UPDATE tasks SET status=?, completed_at=?, result=? WHERE id=?')
        .run('COMPLETED_LOCAL', now, JSON.stringify(result), taskId);
      return this.task(taskId);
    });
  }
  draft(id) { return this.db.prepare('SELECT * FROM drafts WHERE id=?').get(id) ?? null; }
  close() { this.db.close(); }
}
