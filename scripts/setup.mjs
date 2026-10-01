#!/usr/bin/env node
import console from 'node:console';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasConfiguration, saveSetup, SetupError } from './setup-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question, fallback = '') => {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback;
};

try {
  const exists = await hasConfiguration(root);
  const overwrite =
    !exists ||
    ['s', 'sim', 'y', 'yes'].includes(
      (await ask('Já existe um .env. Substituir e renovar os segredos?', 'não')).toLowerCase(),
    );
  if (!overwrite) {
    console.log('Configuração cancelada. O .env existente foi preservado.');
  } else {
    console.log('\nPrivateStream Bridge — configuração textual (alternativa ao setup visual)\n');
    console.log(
      'Veja DDP.md para criar o bot. Para entrada de token mascarada, prefira o setup visual.',
    );
    const clientId = await ask('Application ID');
    const botToken = await ask('Bot Token (não compartilhe o terminal)');
    const guildId = await ask('ID do servidor (opcional)');
    const publicWebUrl = await ask(
      'URL HTTPS; localhost serve só para teste nesta máquina',
      'http://localhost:8080',
    );
    const turnHost = await ask('IPv4 ou DNS do TURN alcançável pelos participantes', 'localhost');
    const turnExternalIp = await ask('IPv4 público do TURN, se houver NAT (opcional)');
    const allowedRoleIds = await ask('IDs de cargos autorizados, separados por vírgula (opcional)');
    const result = await saveSetup(root, {
      clientId,
      botToken,
      guildId,
      publicWebUrl,
      turnHost,
      turnExternalIp,
      allowedRoleIds,
      confirmOverwrite: exists,
    });
    console.log('\nConfiguração salva.');
    console.log(`Convite do bot: ${result.invite}`);
    console.log('Próximo passo: docker compose --project-name privatestream-bridge up -d --build');
  }
} catch (error) {
  console.error(
    error instanceof SetupError
      ? error.message
      : 'Não foi possível salvar. Confira as permissões da pasta.',
  );
  process.exitCode = 1;
} finally {
  rl.close();
}
