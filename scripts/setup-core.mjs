import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, writeFile, link, rename, unlink } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const execFileAsync = promisify(execFile);

export class SetupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function field(value, name, max = 300) {
  // eslint-disable-next-line no-control-regex -- Reject controls before generating .env.
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw new SetupError(`Confira o campo ${name}.`);
  }
  return value.trim();
}

function discordId(value, name, optional = false) {
  const id = field(value ?? '', name, 25);
  if ((!id && optional) || /^\d{17,20}$/.test(id)) return id;
  throw new SetupError(`${name} deve ser um ID numérico do Discord (17 a 20 dígitos).`);
}

export function validateSetup(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new SetupError('Dados inválidos.');
  const clientId = discordId(body.clientId, 'Application ID');
  const botToken = field(body.botToken, 'Bot Token');
  if (!/^[A-Za-z0-9._-]{20,300}$/.test(botToken))
    throw new SetupError('Confira o Bot Token copiado da página Bot.');
  const guildId = discordId(body.guildId, 'ID do servidor', true);
  const roles = field(body.allowedRoleIds ?? '', 'Cargos autorizados', 500);
  const allowedRoleIds = roles
    ? [...new Set(roles.split(',').map((id) => discordId(id, 'ID de cargo')))].join(',')
    : '';

  let url;
  try {
    url = new URL(field(body.publicWebUrl, 'Endereço da transmissão'));
  } catch {
    throw new SetupError('Informe uma URL completa, como https://stream.exemplo.com.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new SetupError(
      'Use HTTPS para outros computadores. A captura de tela em HTTP só funciona em localhost.',
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    /['$\s]/.test(url.href)
  ) {
    throw new SetupError(
      'Use apenas o endereço base, sem usuário, senha, caminho, parâmetros ou fragmento.',
    );
  }

  const turnHost = field(body.turnHost, 'Host do TURN', 253).toLowerCase();
  const domain = turnHost
    .split('.')
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (
    !turnHost ||
    (!isIP(turnHost) && (!domain || /^[\d.]+$/.test(turnHost))) ||
    isIP(turnHost) === 6
  ) {
    throw new SetupError('O TURN precisa de um IPv4 ou nome DNS, sem protocolo, porta ou caminho.');
  }
  if (
    !local &&
    (turnHost === 'localhost' || turnHost.startsWith('127.') || turnHost === '0.0.0.0')
  ) {
    throw new SetupError(
      'Para outros computadores, informe um TURN alcançável por eles, não localhost.',
    );
  }
  const turnExternalIp = field(body.turnExternalIp ?? '', 'IP público do TURN', 40);
  if (turnExternalIp && isIP(turnExternalIp) !== 4)
    throw new SetupError('O IP externo do TURN deve ser um IPv4.');

  return {
    clientId,
    botToken,
    guildId,
    allowedRoleIds,
    publicWebUrl: url.origin,
    turnHost,
    turnExternalIp,
  };
}

export function renderEnv(data) {
  const secret = () => randomBytes(32).toString('hex');
  const values = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    DISCORD_TOKEN: data.botToken,
    DISCORD_CLIENT_ID: data.clientId,
    DISCORD_GUILD_ID: data.guildId,
    DISCORD_ALLOWED_ROLE_IDS: data.allowedRoleIds,
    INTERNAL_API_SECRET: secret(),
    HMAC_SECRET: secret(),
    PUBLIC_WEB_URL: data.publicWebUrl,
    BACKEND_HOST: '0.0.0.0',
    BACKEND_PORT: '3000',
    WEB_PORT: '8080',
    TURN_HOST: data.turnHost,
    PUBLIC_TURN_HOST: data.turnHost,
    TURN_PORT: '3478',
    TURN_TLS_PORT: '5349',
    TURN_MIN_PORT: '49152',
    TURN_MAX_PORT: '49252',
    TURN_REALM: 'private-stream.local',
    TURN_EXTERNAL_IP: data.turnExternalIp,
    TURN_SECRET: secret(),
    TURN_TLS_CERT: '/etc/coturn/certs/fullchain.pem',
    TURN_TLS_KEY: '/etc/coturn/certs/privkey.pem',
    TURN_CREDENTIAL_TTL_SECONDS: '600',
    ROOM_TTL_SECONDS: '3600',
    ACCESS_TOKEN_TTL_SECONDS: '600',
    MAX_VIEWERS: '8',
    ICE_RELAY_ONLY: 'true',
  };
  // Single quotes prevent Docker Compose from interpolating literal values.
  return (
    '# Gerado pelo setup local. Não compartilhe nem publique este arquivo.\n' +
    Object.entries(values)
      .map(([key, value]) => `${key}='${value}'`)
      .join('\n') +
    '\n'
  );
}

export async function hasConfiguration(root) {
  try {
    const info = await lstat(join(root, '.env'));
    if (!info.isFile() || info.isSymbolicLink())
      throw new SetupError('O .env precisa ser um arquivo local regular.', 409);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function saveSetup(root, body) {
  const data = validateSetup(body);
  const exists = await hasConfiguration(root);
  if (exists && body.confirmOverwrite !== true) {
    throw new SetupError(
      'Já existe uma configuração. Confirme a substituição antes de salvar.',
      409,
    );
  }
  const temp = join(root, `.env.setup-${randomBytes(8).toString('hex')}`);
  try {
    await writeFile(temp, renderEnv(data), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    if (body.confirmOverwrite === true) await rename(temp, join(root, '.env'));
    else await link(temp, join(root, '.env')); // Atomic create, never silently overwrites another setup.
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new SetupError('Uma configuração já existe. Reabra o assistente para continuar.', 409);
    throw error;
  } finally {
    await unlink(temp).catch(() => {});
  }
  return {
    invite: `https://discord.com/oauth2/authorize?client_id=${data.clientId}&scope=bot%20applications.commands&permissions=3072`,
    publicWebUrl: data.publicWebUrl,
  };
}

export async function detectDocker() {
  const options = { timeout: 4000, windowsHide: true, maxBuffer: 64 * 1024 };
  const check = async (args) => {
    try {
      await execFileAsync('docker', args, options);
      return true;
    } catch {
      return false;
    }
  };
  const [installed, compose, running] = await Promise.all([
    check(['--version']),
    check(['compose', 'version']),
    check(['info', '--format', '{{.ServerVersion}}']),
  ]);
  return { installed, compose, running };
}

export function runCompose(root, args, signal) {
  // Saved configuration takes precedence over inherited environment variables.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(DISCORD_|INTERNAL_API_SECRET$|HMAC_SECRET$|PUBLIC_|BACKEND_|WEB_PORT$|TURN_|ROOM_|ACCESS_|MAX_VIEWERS$|ICE_|NODE_ENV$|LOG_LEVEL$|COMPOSE_)/.test(
          key,
        ),
    ),
  );
  return execFileAsync(
    'docker',
    [
      'compose',
      '--project-name',
      'privatestream-bridge',
      '--project-directory',
      root,
      '--file',
      join(root, 'docker-compose.yml'),
      '--env-file',
      join(root, '.env'),
      ...args,
    ],
    {
      cwd: root,
      env,
      signal,
      windowsHide: true,
      timeout: 20 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}
