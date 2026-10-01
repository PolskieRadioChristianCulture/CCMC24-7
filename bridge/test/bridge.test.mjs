import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../src/store.mjs';
import { FirebaseReader } from '../src/firebase.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cc-memory-test-'));
  const store = new Store(directory);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, directory };
}
const record = (changes = {}) => ({ id: 'lumina-state', project: 'lumina', kind: 'finding', title: 'Stan LUMINA', body: 'Źródło z repozytorium — do sprawdzenia na produkcji.', status: 'REPO_OBSERVED', source: 'https://github.com/PolskieRadioChristianCulture/Lumina-Web-App', observedAt: '2026-10-01T16:00:00Z', expectedVersion: 0, ...changes });

test('requires an explicit absolute private data path', () => { assert.throws(() => new Store('relative')); assert.throws(() => new Store()); });
test('private memory cannot be created inside the repository', t => {
  const directory = resolve('test-private-path');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => new Store(directory), /outside the repository/);
});
test('common credential formats are refused before a memory write', t => {
  const { store } = fixture(t);
  assert.throws(() => store.upsert(record({ body: 'Bearer never-store-this' })), /SECRET_LIKE_CONTENT_REFUSED/);
  assert.equal(store.search({}).length, 0);
});
test('records persist across host restarts', t => {
  const { store, directory } = fixture(t); store.upsert(record());
  const second = new Store(directory); assert.equal(second.search({})[0].body, record().body); second.close();
});
test('optimistic updates preserve history and reject a stale writer', t => {
  const { store, directory } = fixture(t); store.upsert(record());
  const second = new Store(directory);
  store.upsert(record({ expectedVersion: 1, body: 'New evidence' }));
  assert.throws(() => second.upsert(record({ expectedVersion: 1, body: 'stale' })), /VERSION_CONFLICT/);
  assert.equal(store.history('lumina-state').length, 2); assert.equal(store.search({})[0].body, 'New evidence'); second.close();
});
test('search filters projects and treats SQL wildcards literally', t => {
  const { store } = fixture(t); store.upsert(record());
  assert.equal(store.search({ project: 'mission-control' }).length, 0);
  assert.equal(store.search({ query: '%' }).length, 0);
  assert.equal(store.search({ query: 'repozytorium' }).length, 1);
});
test('draft queue is durable and duplicate requests do not create duplicates', t => {
  const { store, directory } = fixture(t);
  const args = { idempotencyKey: 'lesson-1', title: 'Lekcja', body: 'Treść' };
  const task = store.enqueue(args); const second = new Store(directory);
  assert.equal(second.enqueue(args).id, task.id); assert.equal(second.tasks().length, 1); second.close();
});
test('reusing an idempotency key with changed content fails', t => {
  const { store } = fixture(t); store.enqueue({ idempotencyKey: 'key', title: 'A', body: 'B' });
  assert.throws(() => store.enqueue({ idempotencyKey: 'key', title: 'A', body: 'C' }), /IDEMPOTENCY_CONFLICT/);
});
test('draft completion includes verified local evidence, never remote publication', t => {
  const { store } = fixture(t); const task = store.enqueue({ idempotencyKey: 'draft', title: 'A', body: 'B' });
  const done = store.prepareDraft(task.id);
  assert.equal(done.status, 'COMPLETED_LOCAL'); assert.equal(done.result.published, false);
  assert.equal(store.draft(done.result.draftId).body, 'B');
  assert.equal(store.prepareDraft(task.id).result.draftId, done.result.draftId);
});
test('unknown task cannot claim completion', t => { assert.throws(() => fixture(t).store.prepareDraft('missing'), /TASK_NOT_FOUND/); });
test('missing remote identity refuses access without anonymous fallback', async () => {
  let called = false; const reader = new FirebaseReader({}, () => { called = true; });
  await assert.rejects(reader.missionTasks(), /NOT_CONNECTED/); assert.equal(called, false);
});
test('HTTP rejection is an error and response details cannot leak credentials', async () => {
  const reader = new FirebaseReader({ CC_MC_FIREBASE_ID_TOKEN: 'private-token' }, async () => ({ ok: false, status: 403 }));
  await assert.rejects(reader.missionTasks(), error => error.message.includes('403') && !error.message.includes('private-token'));
});
test('remote queue reads fixed project and excludes attachments', async () => {
  const reader = new FirebaseReader({ CC_MC_FIREBASE_ID_TOKEN: 'token' }, async (url, options) => {
    assert.match(url, /projects\/cc-mission-control\/.*\/CommandQueue/); assert.equal(options.headers.Authorization, 'Bearer token');
    return { ok: true, json: async () => ({ nextPageToken: 'next', documents: [{ name: 'documents/CommandQueue/1', fields: { command: { stringValue: 'test' }, attachment_base64: { stringValue: 'secret' } } }] }) };
  });
  const result = await reader.missionTasks(); assert.equal(result.partial, true); assert.equal(result.tasks[0].command, 'test'); assert.ok(!JSON.stringify(result).includes('secret'));
});
test('LUMINA refuses unknown and private visibility', async () => {
  for (const visibility of [undefined, 'PRIVATE', 'COMMUNITY']) {
    const reader = new FirebaseReader({ CC_LUMINA_FIREBASE_ID_TOKEN: 'token' }, async () => ({ ok: true, json: async () => ({ fields: { visibility: { stringValue: visibility } } }) }));
    await assert.rejects(reader.publicPost('id'), /POST_VISIBILITY_NOT_PUBLIC/);
  }
});
test('public post read returns only approved content fields', async () => {
  const reader = new FirebaseReader({ CC_LUMINA_FIREBASE_ID_TOKEN: 'token' }, async () => ({ ok: true, json: async () => ({ fields: { visibility: { stringValue: 'PUBLIC' }, text: { stringValue: 'Hello' }, email: { stringValue: 'private' } } }) }));
  const result = await reader.publicPost('id'); assert.equal(result.text, 'Hello'); assert.equal(result.email, undefined);
});
test('MCP client discovers tools, writes memory, executes draft and sees durable state after reconnect', async t => {
  const { directory } = fixture(t);
  const connect = async () => {
    const client = new Client({ name: 'bridge-test', version: '1' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('src/server.mjs')], env: { CC_DATA_DIR: directory }, stderr: 'pipe' });
    await client.connect(transport); return client;
  };
  const client = await connect();
  try {
    const list = await client.listTools(); assert.equal(list.tools.length, 10);
    const saved = await client.callTool({ name: 'cc_memory_upsert', arguments: record() }); assert.equal(saved.isError, undefined);
    const invalid = await client.callTool({ name: 'cc_memory_upsert', arguments: record({ expectedVersion: -1 }) }); assert.equal(invalid.isError, true);
    const queued = await client.callTool({ name: 'cc_prepare_draft_enqueue', arguments: { idempotencyKey: 'mcp-draft', title: 'T', body: 'B' } });
    const task = JSON.parse(queued.content[0].text);
    const run = await client.callTool({ name: 'cc_prepare_draft_run', arguments: { taskId: task.id } }); assert.equal(JSON.parse(run.content[0].text).result.published, false);
    const remote = await client.callTool({ name: 'mc_tasks_read', arguments: {} }); assert.equal(remote.isError, true);
  } finally { await client.close(); }
  const second = await connect();
  try { const overview = await second.callTool({ name: 'cc_overview', arguments: {} }); const result = JSON.parse(overview.content[0].text); assert.equal(result.memory.length, 1); assert.equal(result.tasks[0].status, 'COMPLETED_LOCAL'); }
  finally { await second.close(); }
});
