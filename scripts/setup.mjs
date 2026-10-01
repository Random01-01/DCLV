#!/usr/bin/env node
/* global console, process */
import { randomBytes } from 'node:crypto';
import { chmod, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = createInterface({ input, output });
const ask = async (question, fallback = '') => {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback;
};

try {
  try {
    await access('.env', constants.F_OK);
    const replace = await ask('Já existe um .env. Substituir?', 'não');
    if (!['s', 'sim', 'y', 'yes'].includes(replace.toLowerCase())) {
      console.log('Configuração cancelada; o .env existente foi preservado.');
      process.exitCode = 0;
    }
  } catch {
    // First setup.
  }

  if (process.exitCode === 0) process.exit();
  console.log('\nPrivateStream Bridge — configuração inicial\n');
  console.log('Crie o bot em https://discord.com/developers/applications e cole os dados abaixo.');
  console.log('O token do Discord será escrito apenas no .env e nunca será exibido novamente.\n');

  const clientId = await ask('Application ID do Discord');
  const token = await ask('Bot Token do Discord');
  const guildId = await ask('ID do servidor de teste (opcional)');
  const publicWebUrl = await ask('URL que os usuários abrirão', 'http://localhost:8080');
  const publicTurnHost = await ask('Host/IP público ou LAN do TURN', 'localhost');
  const allowedRoles = await ask('IDs de cargos autorizados (opcional, separados por vírgula)');

  if (!clientId || !token) throw new Error('Application ID e Bot Token são obrigatórios.');
  const hex = () => randomBytes(32).toString('hex');
  const env = `# Gerado por npm run setup — não compartilhe este arquivo\nNODE_ENV=production\nLOG_LEVEL=info\n\nDISCORD_TOKEN=${token}\nDISCORD_CLIENT_ID=${clientId}\nDISCORD_GUILD_ID=${guildId}\nDISCORD_ALLOWED_ROLE_IDS=${allowedRoles}\n\nINTERNAL_API_SECRET=${hex()}\nHMAC_SECRET=${hex()}\nPUBLIC_WEB_URL=${publicWebUrl.replace(/\/$/, '')}\nBACKEND_HOST=0.0.0.0\nBACKEND_PORT=3000\nWEB_PORT=8080\n\nTURN_HOST=${publicTurnHost}\nPUBLIC_TURN_HOST=${publicTurnHost}\nTURN_PORT=3478\nTURN_TLS_PORT=5349\nTURN_MIN_PORT=49152\nTURN_MAX_PORT=49252\nTURN_REALM=private-stream.local\nTURN_EXTERNAL_IP=\nTURN_SECRET=${hex()}\nTURN_TLS_CERT=/etc/coturn/certs/fullchain.pem\nTURN_TLS_KEY=/etc/coturn/certs/privkey.pem\nTURN_CREDENTIAL_TTL_SECONDS=600\nROOM_TTL_SECONDS=3600\nACCESS_TOKEN_TTL_SECONDS=600\nMAX_VIEWERS=8\nICE_RELAY_ONLY=true\n`;

  await writeFile('.env', env, { encoding: 'utf8', mode: 0o600 });
  try { await chmod('.env', 0o600); } catch { /* Windows does not expose POSIX modes. */ }
  const invite = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=3072`;
  console.log('\nConfiguração salva em .env.');
  console.log(`Convite do bot: ${invite}`);
  console.log('\nPróximo passo: docker compose up -d --build');
} finally {
  rl.close();
}
