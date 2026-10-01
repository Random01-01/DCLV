import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('iniciar-stream')
    .setDescription('Cria uma sala privada de transmissão WebRTC')
    .addStringOption((option) =>
      option
        .setName('preset_qualidade')
        .setDescription('Prioriza fluidez e define o teto de bitrate')
        .setRequired(false)
        .addChoices(
          { name: '1080p 60fps — Gamer/Ação — 8 Mbps', value: '1080p60' },
          { name: '1080p 30fps — Padrão — 4,5 Mbps', value: '1080p30' },
          { name: '720p 60fps — Fluido leve — 3,5 Mbps', value: '720p60' },
          { name: '720p 30fps — Econômico — 2 Mbps', value: '720p30' },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('entrar-stream').setDescription('Gera um link temporário para a transmissão ativa'),
  new SlashCommandBuilder()
    .setName('encerrar-stream')
    .setDescription('Encerra a transmissão e revoga as credenciais TURN')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('status-stream').setDescription('Mostra o status público e o relay da transmissão'),
].map((command) => command.toJSON());
