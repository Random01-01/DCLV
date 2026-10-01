import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { createSetupServer } from './setup-ui.mjs';
import { hasConfiguration, renderEnv, saveSetup, validateSetup } from './setup-core.mjs';

const fetch = globalThis.fetch;
const valid = {
  clientId: '123456789012345678',
  botToken: 'synthetic-token-for-tests-000000000000',
  guildId: '234567890123456789',
  allowedRoleIds: '',
  publicWebUrl: 'https://stream.example.com',
  turnHost: 'turn.example.com',
  turnExternalIp: '',
};
const ready = async () => ({ installed: true, compose: true, running: true });
const unavailable = async () => ({ installed: false, compose: false, running: false });

function rawStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'private-stream-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function harness(t, overrides = {}) {
  const root = await directory(t);
  const server = createSetupServer({
    root,
    checkDocker: ready,
    compose: async () => {},
    ...overrides,
  });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  t.after(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  const html = await page.text();
  const key = html.match(/name="setup-key" content="([^"]*)"/)?.[1];
  const api = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-setup-key': key ?? '',
        origin: base,
        'content-type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { root, server, base, api, page, html, key };
}

async function finished(api) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await (await api('/api/status')).json();
    if (result.job.state !== 'running') return result.job;
    await delay(5);
  }
  assert.fail('Setup job did not finish');
}

test('normalizes safe fields and allows HTTP only on the local computer', () => {
  const data = validateSetup({
    ...valid,
    turnHost: 'TURN.Example.com',
    allowedRoleIds: '345678901234567890, 345678901234567890',
  });
  assert.equal(data.turnHost, 'turn.example.com');
  assert.equal(data.allowedRoleIds, '345678901234567890');
  assert.equal(
    validateSetup({ ...valid, publicWebUrl: 'http://localhost:8080', turnHost: 'localhost' })
      .publicWebUrl,
    'http://localhost:8080',
  );
});

const invalid = [
  ['botToken', 'token\nHMAC_SECRET=injected'],
  ['botToken', 'token#comment'],
  ['botToken', '${SHELL_VALUE}'],
  ['clientId', 'not-an-id'],
  ['guildId', 'bad-id'],
  ['allowedRoleIds', '12,13'],
  ['publicWebUrl', 'http://192.168.1.20:8080'],
  ['publicWebUrl', 'https://name:secret@stream.example.com'],
  ['publicWebUrl', 'https://stream.example.com/path'],
  ['publicWebUrl', 'https://stream.example.com?key=secret'],
  ['publicWebUrl', 'https://stream.example.com#token'],
  ['publicWebUrl', 'file:///tmp/test'],
  ['turnHost', 'turn.example.com;echo bad'],
  ['turnHost', 'https://turn.example.com'],
  ['turnHost', '999.999.999.999'],
  ['turnHost', 'localhost'],
  ['turnHost', '127.0.0.1'],
  ['turnHost', '$(command)'],
  ['turnHost', "host'"],
  ['turnHost', '::1'],
  ['turnExternalIp', 'public.example.com'],
];
test('rejects malformed fields, insecure network URLs and environment injection', () => {
  for (const [field, value] of invalid) {
    assert.throws(
      () => validateSetup({ ...valid, [field]: value }),
      undefined,
      `${field}: ${value}`,
    );
  }
  for (const value of [null, [], 'text', 42, {}]) assert.throws(() => validateSetup(value));
});

test('generates three independent secrets and literal, quoted Compose values', () => {
  const env = renderEnv(validateSetup(valid));
  const secrets = [
    ...env.matchAll(/^(?:INTERNAL_API_SECRET|HMAC_SECRET|TURN_SECRET)='([a-f0-9]{64})'$/gm),
  ].map((match) => match[1]);
  assert.equal(secrets.length, 3);
  assert.equal(new Set(secrets).size, 3);
  assert.match(env, /PUBLIC_WEB_URL='https:\/\/stream.example.com'/);
  assert.match(env, /ICE_RELAY_ONLY='true'/);
  assert.notEqual(renderEnv(validateSetup(valid)), env);
});

test('writes a private .env without returning the bot token or internal secrets', async (t) => {
  const root = await directory(t);
  const result = await saveSetup(root, valid);
  const text = await readFile(join(root, '.env'), 'utf8');
  assert.ok(text.includes(valid.botToken));
  assert.equal(await hasConfiguration(root), true);
  if (process.platform !== 'win32')
    assert.equal((await stat(join(root, '.env'))).mode & 0o777, 0o600);
  assert.equal(result.publicWebUrl, valid.publicWebUrl);
  assert.ok(result.invite.includes('permissions=3072'));
  assert.ok(!JSON.stringify(result).includes(valid.botToken));
  assert.ok(!JSON.stringify(result).includes('HMAC_SECRET'));
});

test('preserves existing configuration unless replacement is explicitly confirmed', async (t) => {
  const root = await directory(t);
  await saveSetup(root, valid);
  const before = await readFile(join(root, '.env'), 'utf8');
  await assert.rejects(saveSetup(root, valid), { status: 409 });
  assert.equal(await readFile(join(root, '.env'), 'utf8'), before);
  await saveSetup(root, { ...valid, confirmOverwrite: true });
  assert.notEqual(await readFile(join(root, '.env'), 'utf8'), before);
});

test('does not replace an existing configuration for invalid inputs', async (t) => {
  const root = await directory(t);
  await saveSetup(root, valid);
  const before = await readFile(join(root, '.env'), 'utf8');
  await assert.rejects(
    saveSetup(root, { ...valid, botToken: '\nINVALID', confirmOverwrite: true }),
  );
  assert.equal(await readFile(join(root, '.env'), 'utf8'), before);
});

test(
  'refuses a symlink .env instead of following it',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await directory(t);
    const other = join(root, 'other-file');
    await writeFile(other, 'original');
    await symlink(other, join(root, '.env'));
    await assert.rejects(saveSetup(root, { ...valid, confirmOverwrite: true }), { status: 409 });
    assert.equal(await readFile(other, 'utf8'), 'original');
  },
);

test('serves the minimal UI with a memory-only access key and privacy headers', async (t) => {
  const { page, html, key, api } = await harness(t);
  assert.equal(page.status, 200);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.ok(html.includes('Conecte. Compartilhe.'));
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await api('/api/status')).status, 200);
});

test('blocks missing or invalid setup keys, foreign origins, and rebinding hostnames', async (t) => {
  const { base, api } = await harness(t);
  assert.equal((await fetch(`${base}/api/status`)).status, 403);
  assert.equal((await api('/api/status', undefined, { 'x-setup-key': 'invalid' })).status, 403);
  assert.equal(
    (await api('/api/setup', valid, { origin: 'https://untrusted.example' })).status,
    403,
  );
  assert.equal((await api('/api/setup', valid, { origin: '' })).status, 403);
  // Native fetch overrides Host; use HTTP directly to exercise rebinding protection.
  assert.equal(await rawStatus(base, { host: 'untrusted.example' }), 403);
  assert.equal((await api('/api/setup', valid, { 'content-type': 'text/plain' })).status, 415);
});

test('rejects oversized or malformed JSON before writing any configuration', async (t) => {
  const { base, api, key, root } = await harness(t);
  assert.equal((await api('/api/setup', { text: 'a'.repeat(20_000) })).status, 413);
  const invalidJson = await fetch(`${base}/api/setup`, {
    method: 'POST',
    headers: { origin: base, 'x-setup-key': key, 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(await hasConfiguration(root), false);
});

test('saves through the authenticated API and never serves .env files', async (t) => {
  const { api, root } = await harness(t);
  const result = await api('/api/setup', valid);
  assert.equal(result.status, 200);
  assert.ok(!(await result.text()).includes(valid.botToken));
  const status = await (await api('/api/status')).json();
  assert.equal(status.configured, true);
  assert.ok(!JSON.stringify(status).includes(valid.botToken));
  assert.equal((await api('/.env')).status, 404);
  assert.equal((await api('/scripts/setup-ui.mjs')).status, 404);
  assert.ok((await readFile(join(root, '.env'), 'utf8')).includes(valid.botToken));
});

test('requires saved configuration before starting Docker', async (t) => {
  let calls = 0;
  const { api } = await harness(t, {
    compose: async () => {
      calls += 1;
    },
  });
  assert.equal((await api('/api/start', {})).status, 409);
  assert.equal(calls, 0);
});

test('starts Compose asynchronously and refuses duplicate starts or edits during a build', async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  const { api } = await harness(t, {
    compose: async (_root, args) => {
      calls.push(args);
      await pending;
    },
  });
  await api('/api/setup', valid);
  const starts = await Promise.all([api('/api/start', {}), api('/api/start', {})]);
  assert.deepEqual(starts.map((r) => r.status).sort(), [202, 409]);
  assert.equal((await api('/api/setup', { ...valid, confirmOverwrite: true })).status, 409);
  assert.equal((await api('/api/quit', {})).status, 409);
  release();
  assert.equal((await finished(api)).state, 'success');
  assert.deepEqual(calls, [
    ['config', '--quiet'],
    ['up', '-d', '--build', '--wait', '--wait-timeout', '90'],
  ]);
});

test('reports unavailable Docker without attempting to build', async (t) => {
  let calls = 0;
  const { api } = await harness(t, {
    checkDocker: unavailable,
    compose: async () => {
      calls += 1;
    },
  });
  await api('/api/setup', valid);
  assert.equal((await api('/api/start', {})).status, 202);
  const job = await finished(api);
  assert.equal(job.state, 'error');
  assert.ok(job.message.includes('Docker'));
  assert.equal(calls, 0);
});

test('does not echo Docker stdout, errors, tokens or addresses to the browser', async (t) => {
  const { api } = await harness(t, {
    compose: async () => {
      throw new Error(`${valid.botToken} secret-private.example 192.168.0.20`);
    },
  });
  await api('/api/setup', valid);
  await api('/api/start', {});
  const job = await finished(api);
  assert.equal(job.state, 'error');
  const text = JSON.stringify(job);
  assert.ok(!text.includes(valid.botToken));
  assert.ok(!text.includes('secret-private.example'));
  assert.ok(!text.includes('192.168.0.20'));
});

test('public preview accepts proxy hosts but cannot save, start, or stop anything', async (t) => {
  let calls = 0;
  const { api, base, root, page, key } = await harness(t, {
    demo: true,
    compose: async () => {
      calls += 1;
    },
  });
  assert.equal(key, '');
  assert.equal(page.headers.get('x-frame-options'), null);
  assert.ok(!page.headers.get('content-security-policy').includes('frame-ancestors'));
  assert.equal(
    await rawStatus(`${base}/api/status`, {
      host: '4177-preview.e2b.app',
      origin: 'https://4177-preview.e2b.app',
    }),
    200,
  );
  const status = await api('/api/status');
  assert.equal(status.status, 200);
  assert.equal((await status.json()).demo, true);
  for (const path of ['/api/setup', '/api/start', '/api/quit'])
    assert.equal((await api(path, valid)).status, 403);
  assert.equal(calls, 0);
  assert.equal(await hasConfiguration(root), false);
});
