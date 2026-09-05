import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinalEventsApiServer } from '../src/infrastructure/integration/final-events-api-server.js';

const TOKEN = '0123456789abcdef0123456789abcdef';

async function withServer(service, fn) {
  const server = createFinalEventsApiServer({ service, token: TOKEN, diagnosticLog: { async write() {} } });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try { return await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function auth() { return { authorization: `Bearer ${TOKEN}` }; }

test('health is read-only and does not require credentials', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'biometric-final-events-api', apiVersion: 'v1' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('event endpoints require a bearer token and never support writes', async () => {
  let calls = 0;
  await withServer({ async list() { calls += 1; return { apiVersion: 'v1', items: [], page: {} }; } }, async (base) => {
    const denied = await fetch(`${base}/api/v1/final-events`);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('www-authenticate'), 'Bearer');
    assert.equal(calls, 0);

    const accepted = await fetch(`${base}/api/v1/final-events?after_id=0&limit=100`, { headers: auth() });
    assert.equal(accepted.status, 200);
    assert.equal(calls, 1);

    const write = await fetch(`${base}/api/v1/final-events`, { method: 'POST', headers: auth(), body: '{}' });
    assert.equal(write.status, 405);
    assert.equal(write.headers.get('allow'), 'GET');
    assert.equal(calls, 1);
  });
});

test('HTTP layer passes cursor and UUID without exposing another integration surface', async () => {
  const calls = [];
  await withServer({
    async list(args) { calls.push(['list', args]); return { apiVersion: 'v1', items: [], page: {} }; },
    async getByUuid(uuid) { calls.push(['get', uuid]); return { apiVersion: 'v1', event: { eventId: uuid } }; }
  }, async (base) => {
    await fetch(`${base}/api/v1/final-events?after_id=5&limit=7`, { headers: auth() });
    await fetch(`${base}/api/v1/final-events/11111111-1111-4111-8111-111111111111`, { headers: auth() });
    assert.deepEqual(calls, [
      ['list', { afterId: '5', limit: '7' }],
      ['get', '11111111-1111-4111-8111-111111111111']
    ]);
  });
});
