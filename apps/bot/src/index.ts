import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
} from 'discord.js';
import type { Preset } from '@private-stream/shared';
import { BackendClient } from './backend-client.js';
import { commands } from './commands.js';
import { loadBotConfig } from './config.js';

const config = loadBotConfig();
const backend = new BackendClient(config);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isManager(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inGuild()) return false;
  const member = interaction.member as GuildMember;
  return Boolean(member.permissions?.has(PermissionsBitField.Flags.ManageGuild));
}

function hasAllowedRole(interaction: ChatInputCommandInteraction): boolean {
  if (config.allowedRoleIds.size === 0) return true;
  if (!interaction.inGuild()) return false;
  const member = interaction.member as GuildMember;
  return [...config.allowedRoleIds].some((id) => member.roles.cache.has(id));
}

function roomLink(roomId: string, role: 'host' | 'viewer', token: string): string {
  return `${config.publicWebUrl}/room/${encodeURIComponent(roomId)}/${role}#token=${encodeURIComponent(token)}`;
}

function hostButton(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('Abrir interface do host').setStyle(ButtonStyle.Link).setURL(url),
  );
}

async function replyError(interaction: ChatInputCommandInteraction, message = 'Não foi possível concluir a operação agora.') {
  if (interaction.replied || interaction.deferred) return interaction.editReply({ content: message });
  return interaction.reply({ content: message, ephemeral: true });
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return replyError(interaction, 'Este comando só funciona dentro de um servidor.').then(() => undefined);

  try {
    if (interaction.commandName === 'iniciar-stream') {
      if (!isManager(interaction)) return replyError(interaction, 'Você precisa da permissão Gerenciar servidor.').then(() => undefined);
      await interaction.deferReply({ ephemeral: true });
      const preset = (interaction.options.getString('preset_qualidade') ?? '1080p60') as Preset;
      const created = await backend.createRoom(interaction.guildId, interaction.user.id, preset);
      const url = roomLink(created.roomId, 'host', created.hostToken);
      await interaction.editReply({
        content: `Sala privada criada (${preset}). O token expira em 10 minutos; mantenha esta mensagem privada.`,
        components: [hostButton(url)],
      });
      return;
    }

    if (interaction.commandName === 'entrar-stream') {
      if (!hasAllowedRole(interaction)) return replyError(interaction, 'Você não está autorizado a assistir a streams neste servidor.').then(() => undefined);
      await interaction.deferReply({ ephemeral: true });
      const active = await backend.activeRoom(interaction.guildId);
      if (!active) return interaction.editReply({ content: 'Não há uma transmissão ativa neste servidor.' }).then(() => undefined);
      const token = await backend.createViewerToken(active.roomId, interaction.user.id);
      const url = roomLink(active.roomId, 'viewer', token.viewerToken);
      await interaction.editReply({ content: `Seu link privado expira em 10 minutos. Não o encaminhe:\n${url}` });
      return;
    }

    if (interaction.commandName === 'encerrar-stream') {
      if (!isManager(interaction)) return replyError(interaction, 'Você precisa da permissão Gerenciar servidor.').then(() => undefined);
      await interaction.deferReply({ ephemeral: true });
      const active = await backend.activeRoom(interaction.guildId);
      if (!active) return interaction.editReply({ content: 'Não há uma transmissão ativa.' }).then(() => undefined);
      await backend.endRoom(active.roomId);
      await interaction.editReply({ content: 'Transmissão encerrada. Conexões WebRTC e credenciais TURN foram revogadas.' });
      return;
    }

    if (interaction.commandName === 'status-stream') {
      await interaction.deferReply({ ephemeral: true });
      const active = await backend.activeRoom(interaction.guildId);
      if (!active) return interaction.editReply({ content: 'Não há uma transmissão ativa.' }).then(() => undefined);
      const status = await backend.status(active.roomId);
      await interaction.editReply({
        content: [
          `**PrivateStream Bridge** — ${status.active ? 'ativo' : 'encerrado'}`,
          `Alvo: ${status.target.width}x${status.target.height} a ${status.target.fps}fps (${status.preset})`,
          `Espectadores: ${status.viewers}/${status.maxViewers}`,
          `Relay TURN: ${status.relayConfigured ? 'configurado' : 'indisponível'}`,
          `Expira: <t:${Math.floor(Date.parse(status.expiresAt) / 1000)}:R>`,
        ].join('\n'),
      });
    }
  } catch (error) {
    // Do not log request payloads, access tokens, Discord IDs, IPs, or ICE data.
    console.error('stream_command_failed', error instanceof Error ? error.message : 'unknown');
    await replyError(interaction);
  }
}

client.once(Events.ClientReady, (ready) => {
  console.log(`Discord bot online como ${ready.user.tag}`);
});
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) await handleCommand(interaction);
});

const rest = new REST({ version: '10' }).setToken(config.token);
await rest.put(
  config.guildId ? Routes.applicationGuildCommands(config.clientId, config.guildId) : Routes.applicationCommands(config.clientId),
  { body: commands },
);
await client.login(config.token);
