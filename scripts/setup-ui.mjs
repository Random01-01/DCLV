#!/usr/bin/env node
import console from 'node:console';
import process from 'node:process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  SetupError,
  detectDocker,
  hasConfiguration,
  runCompose,
  saveSetup,
} from './setup-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
]);

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function equalKey(value, key) {
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(key);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new SetupError('Use uma requisição JSON.', 415);
  }
  if (Number(request.headers['content-length'] ?? 0) > 16_384)
    throw new SetupError('Dados muito grandes.', 413);
  let body = '';
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new SetupError('Dados muito grandes.', 413);
    body += chunk.toString('utf8');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new SetupError('JSON inválido.');
  }
}

export function createSetupServer({
  root = ROOT,
  demo = false,
  checkDocker = detectDocker,
  compose = runCompose,
} = {}) {
  const key = randomBytes(32).toString('hex');
  let saving = false;
  let job = { state: 'idle', phase: '', message: '' };
  let dockerCache;
  let dockerCacheTime = 0;
  // Native AbortController is available in the supported Node versions.
  const controller = new globalThis.AbortController();

  const inspectDocker = async (refresh = false) => {
    if (demo) return { installed: false, compose: false, running: false };
    if (refresh || !dockerCache || Date.now() - dockerCacheTime > 5000) {
      dockerCache = await checkDocker();
      dockerCacheTime = Date.now();
    }
    return dockerCache;
  };

  const buildStack = async () => {
    try {
      const docker = await inspectDocker(true);
      if (!docker.installed || !docker.compose || !docker.running) {
        throw new SetupError(
          'Instale e abra o Docker Desktop (ou Engine com Compose v2) e tente novamente.',
        );
      }
      job = {
        state: 'running',
        phase: 'validate',
        message: 'Verificando a configuração do Docker Compose…',
      };
      await compose(root, ['config', '--quiet'], controller.signal);
      job = {
        state: 'running',
        phase: 'build',
        message: 'Preparando e iniciando os containers. A primeira vez pode levar vários minutos.',
      };
      await compose(
        root,
        ['up', '-d', '--build', '--wait', '--wait-timeout', '90'],
        controller.signal,
      );
      job = {
        state: 'success',
        phase: 'ready',
        message:
          'Containers iniciados. Aguarde o bot ficar online no Discord e use /iniciar-stream.',
      };
    } catch (error) {
      // Never return Docker stdout/stderr: it may contain credentials or addresses.
      job = {
        state: 'error',
        phase: job.phase,
        message:
          error instanceof SetupError
            ? error.message
            : 'Não foi possível iniciar o stack. Verifique o Docker, a conexão com a internet e as portas em uso. O guia DDP contém ajuda para tentar novamente.',
      };
    }
  };

  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader(
      'content-security-policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'" +
        (demo ? '' : "; frame-ancestors 'none'"),
    );
    if (!demo) response.setHeader('x-frame-options', 'DENY');
    try {
      const port = server.address()?.port;
      const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
      const host = request.headers.host ?? '';
      if (!demo) {
        const remote = request.socket.remoteAddress;
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || !allowedHosts.has(host)) {
          throw new SetupError(
            'O setup só pode ser usado neste computador. Abra pelo atalho local.',
            403,
          );
        }
        if (request.headers.origin && request.headers.origin !== `http://${host}`) {
          throw new SetupError('Origem não autorizada.', 403);
        }
      }
      // Never trust the Host header to build redirect targets or filesystem paths.
      const path = new URL(request.url ?? '/', 'http://setup.invalid').pathname;
      if (request.method === 'GET' && ASSETS.has(path)) {
        const [name, type] = ASSETS.get(path);
        let content = await readFile(join(ROOT, 'setup', name), 'utf8');
        if (name === 'index.html') content = content.replace('__SETUP_KEY__', demo ? '' : key);
        response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
        response.end(content);
        return;
      }
      if (request.method === 'GET' && path === '/DDP.md') {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(await readFile(join(ROOT, 'DDP.md')));
        return;
      }
      if (!path.startsWith('/api/')) {
        json(response, 404, { error: 'Página não encontrada.' });
        return;
      }
      if (demo && request.method !== 'GET')
        throw new SetupError('A prévia não salva credenciais nem executa o Docker.', 403);
      if (!demo && !equalKey(request.headers['x-setup-key'], key))
        throw new SetupError('Reabra a página do setup para continuar.', 403);
      if (request.method === 'GET' && path === '/api/status') {
        json(response, 200, {
          demo,
          nodeVersion: process.versions.node,
          docker: await inspectDocker(),
          configured: demo ? false : await hasConfiguration(root),
          job,
        });
        return;
      }
      if (request.method !== 'POST') {
        json(response, 404, { error: 'Operação não encontrada.' });
        return;
      }
      if (request.headers.origin !== `http://${host}`)
        throw new SetupError('Origem não autorizada.', 403);
      const body = await readJson(request);
      if (saving || job.state === 'running')
        throw new SetupError('Aguarde a operação em andamento.', 409);
      if (path === '/api/setup') {
        saving = true;
        try {
          const result = await saveSetup(root, body);
          job = { state: 'idle', phase: '', message: '' };
          json(response, 200, { ok: true, ...result });
        } finally {
          saving = false;
        }
        return;
      }
      if (path === '/api/start') {
        // Acquire the job lock before any asynchronous filesystem or Docker work.
        job = { state: 'running', phase: 'check', message: 'Verificando o Docker…' };
        try {
          if (!(await hasConfiguration(root)))
            throw new SetupError('Salve a configuração antes de iniciar.', 409);
        } catch (error) {
          job = { state: 'idle', phase: '', message: '' };
          throw error;
        }
        void buildStack();
        json(response, 202, { ok: true, job });
        return;
      }
      if (path === '/api/quit') {
        json(response, 200, { ok: true });
        server.close();
        server.closeIdleConnections();
        return;
      }
      json(response, 404, { error: 'Operação não encontrada.' });
    } catch (error) {
      json(response, error instanceof SetupError ? error.status : 500, {
        error:
          error instanceof SetupError
            ? error.message
            : 'Não foi possível concluir. Verifique as permissões da pasta do projeto.',
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('close', () => controller.abort());
  return server;
}

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? 'rundll32.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log('Abra o endereço acima no navegador deste computador.'));
  child.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.SETUP_PORT ?? 4177);
  const demo = process.argv.includes('--demo');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Porta de setup inválida.');
    process.exitCode = 1;
  } else {
    const server = createSetupServer({ demo });
    server.on('error', (error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? 'O setup já está aberto. Acesse o endereço local ou feche a outra janela.'
          : 'Não foi possível abrir o assistente local.',
      );
      process.exitCode = 1;
    });
    // Local mode rejects non-loopback clients and untrusted Host/Origin headers.
    // Demo mode is public for previews, but all mutation endpoints are disabled.
    server.listen(port, '0.0.0.0', () => {
      const url = `http://localhost:${port}`;
      console.log(`${demo ? 'Prévia visual (sem alterações)' : 'Setup local'}: ${url}`);
      if (!demo && process.env.SETUP_NO_OPEN !== '1') openBrowser(url);
    });
  }
}
