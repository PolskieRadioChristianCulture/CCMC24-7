import test from 'node:test';
import assert from 'node:assert/strict';
import { writeCommand } from '../../src/command-queue.mjs';

test('accepted command returns the persisted ID without claiming execution', async () => {
  const result = await writeCommand('endpoint', { command: { stringValue: 'test' } }, async (_, options) => {
    assert.equal(options.method, 'POST');
    return { ok: true, json: async () => ({ name: 'projects/project/databases/(default)/documents/CommandQueue/123' }) };
  });
  assert.deepEqual(result, { id: '123', status: 'pending' });
});
test('HTTP denial, network failure and missing persisted ID cannot claim success', async () => {
  await assert.rejects(writeCommand('endpoint', {}, async () => ({ ok: false, status: 403 })), /COMMAND_REJECTED_403/);
  await assert.rejects(writeCommand('endpoint', {}, async () => { throw new Error('network'); }), /network/);
  await assert.rejects(writeCommand('endpoint', {}, async () => ({ ok: true, json: async () => ({}) })), /COMMAND_WRITE_NOT_CONFIRMED/);
});
