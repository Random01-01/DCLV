import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('CHANGE_ME')) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string;
  backendUrl: string;
  internalApiSecret: string;
  publicWebUrl: string;
  allowedRoleIds: Set<string>;
}

export function loadBotConfig(): BotConfig {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: process.env.DISCORD_GUILD_ID || undefined,
    backendUrl: process.env.BACKEND_URL ?? 'http://backend:3000',
    internalApiSecret: required('INTERNAL_API_SECRET'),
    publicWebUrl: (process.env.PUBLIC_WEB_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
    allowedRoleIds: new Set((process.env.DISCORD_ALLOWED_ROLE_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean)),
  };
}
