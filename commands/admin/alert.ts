import { ApplicationCommandOptionType, ChannelType, PermissionFlagsBits } from 'discord.js';
import { ContentAlertRepository, type AlertProvider } from '../../utils/db';

const PROVIDERS: AlertProvider[] = ['youtube', 'twitch'];

function normalizeProvider(raw: string | null): AlertProvider | null {
  if (!raw) {
    return null;
  }
  const value = raw.toLowerCase();
  return PROVIDERS.includes(value as AlertProvider) ? (value as AlertProvider) : null;
}

function isValidProviderUrl(provider: AlertProvider, url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (provider === 'youtube') {
      return parsed.hostname.includes('youtube.com');
    }
    return parsed.hostname.includes('twitch.tv');
  } catch {
    return false;
  }
}

export = {
  name: 'alert',
  category: 'admin',
  ownerOnly: false,
  usage: 'alert [add|edit|delete|list]',
  examples: ['alert add', 'alert list'],
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  description: 'Gérer les alertes YouTube/Twitch.',
  options: [
    {
      name: 'add',
      description: 'Ajouter une alerte',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'provider',
          description: 'Plateforme à suivre',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: 'YouTube', value: 'youtube' },
            { name: 'Twitch', value: 'twitch' },
          ],
        },
        {
          name: 'channel_url',
          description: 'URL de la chaîne (YouTube/Twitch)',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'discord_channel',
          description: 'Salon Discord de destination',
          type: ApplicationCommandOptionType.Channel,
          required: true,
          channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        },
        {
          name: 'mention',
          description: 'Texte à mentionner avant l’embed (ex: @everyone, <@&roleId>)',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: 'edit',
      description: 'Modifier une alerte',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'id',
          description: 'ID de l’alerte',
          type: ApplicationCommandOptionType.Integer,
          required: true,
        },
        {
          name: 'provider',
          description: 'Nouveau provider',
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            { name: 'YouTube', value: 'youtube' },
            { name: 'Twitch', value: 'twitch' },
          ],
        },
        {
          name: 'channel_url',
          description: 'Nouvelle URL de chaîne',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: 'discord_channel',
          description: 'Nouveau salon Discord',
          type: ApplicationCommandOptionType.Channel,
          required: false,
          channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        },
        {
          name: 'mention',
          description: 'Nouveau texte de mention',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    },
    {
      name: 'delete',
      description: 'Supprimer une alerte',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'id',
          description: 'ID de l’alerte',
          type: ApplicationCommandOptionType.Integer,
          required: true,
        },
      ],
    },
    {
      name: 'list',
      description: 'Lister les alertes de la guilde',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],
  async runInteraction(client: any, interaction: any) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Cette commande doit être utilisée dans un serveur.', ephemeral: true });
    }

    const repository = new ContentAlertRepository();
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'add') {
      const providerRaw = interaction.options.getString('provider', true);
      const provider = normalizeProvider(providerRaw);
      if (!provider) {
        return interaction.reply({ content: 'Provider invalide.', ephemeral: true });
      }

      const channelUrl = interaction.options.getString('channel_url', true).trim();
      const targetChannel = interaction.options.getChannel('discord_channel', true);
      const mention = interaction.options.getString('mention')?.trim() || '';

      if (!isValidProviderUrl(provider, channelUrl)) {
        return interaction.reply({
          content: `URL invalide pour ${provider}.`,
          ephemeral: true,
        });
      }

      if (provider === 'youtube') {
        const youtubeCount = repository.listByGuild(interaction.guildId).filter((x) => x.provider === 'youtube').length;
        if (youtubeCount >= 4) {
          return interaction.reply({
            content: 'Limite atteinte: maximum 4 alertes YouTube par guilde.',
            ephemeral: true,
          });
        }
      }

      try {
        const created = repository.create({
          guildId: interaction.guildId,
          provider,
          channelUrl,
          discordChannelId: targetChannel.id,
          mention,
        });

        return interaction.reply({
          content: `Alerte créée (#${created?.id}): \`${provider}\` -> <#${targetChannel.id}>`,
          ephemeral: true,
        });
      } catch (e: any) {
        return interaction.reply({
          content: `Impossible de créer l'alerte: ${e?.message || 'erreur inconnue'}`,
          ephemeral: true,
        });
      }
    }

    if (subcommand === 'list') {
      const rows = repository.listByGuild(interaction.guildId);
      if (!rows.length) {
        return interaction.reply({ content: 'Aucune alerte configurée.', ephemeral: true });
      }

      const content = rows
        .slice(0, 25)
        .map(
          (row) =>
            `#${row.id} | \`${row.provider}\` | ${row.channelUrl} | -> <#${row.discordChannelId}> | mention: ${
              row.mention || 'aucune'
            }`,
        )
        .join('\n');

      return interaction.reply({ content, ephemeral: true });
    }

    if (subcommand === 'delete') {
      const id = interaction.options.getInteger('id', true);
      const row = repository.findById(id);
      if (!row || row.guildId !== interaction.guildId) {
        return interaction.reply({ content: 'Alerte introuvable pour cette guilde.', ephemeral: true });
      }

      const changes = repository.deleteById(id);
      if (!changes) {
        return interaction.reply({ content: 'Alerte introuvable.', ephemeral: true });
      }

      return interaction.reply({ content: `Alerte #${id} supprimée.`, ephemeral: true });
    }

    if (subcommand === 'edit') {
      const id = interaction.options.getInteger('id', true);
      const row = repository.findById(id);
      if (!row || row.guildId !== interaction.guildId) {
        return interaction.reply({ content: 'Alerte introuvable pour cette guilde.', ephemeral: true });
      }

      const nextProvider = normalizeProvider(interaction.options.getString('provider')) || row.provider;
      const nextUrl = interaction.options.getString('channel_url')?.trim() || row.channelUrl;
      const nextTarget = interaction.options.getChannel('discord_channel');
      const nextMention = interaction.options.getString('mention');

      if (!isValidProviderUrl(nextProvider, nextUrl)) {
        return interaction.reply({ content: `URL invalide pour ${nextProvider}.`, ephemeral: true });
      }

      if (nextProvider === 'youtube') {
        const youtubeCount = repository
          .listByGuild(interaction.guildId)
          .filter((x) => x.provider === 'youtube' && x.id !== id).length;
        if (youtubeCount >= 4) {
          return interaction.reply({
            content: 'Limite atteinte: maximum 4 alertes YouTube par guilde.',
            ephemeral: true,
          });
        }
      }

      const providerChanged = nextProvider !== row.provider;
      const channelChanged = nextUrl !== row.channelUrl;
      const changes = repository.updateById(id, {
        provider: nextProvider,
        channelUrl: nextUrl,
        discordChannelId: nextTarget?.id || row.discordChannelId,
        mention: nextMention !== null ? nextMention : row.mention,
        providerChannelId: providerChanged || channelChanged ? null : undefined,
        providerChannelName: providerChanged || channelChanged ? null : undefined,
        lastContentId: providerChanged || channelChanged ? null : undefined,
        lastContentUrl: providerChanged || channelChanged ? null : undefined,
        lastContentType: providerChanged || channelChanged ? null : undefined,
        lastAnnouncedAt: providerChanged || channelChanged ? null : undefined,
      });

      if (!changes) {
        return interaction.reply({ content: "Aucune modification n'a été appliquée.", ephemeral: true });
      }

      return interaction.reply({ content: `Alerte #${id} mise à jour.`, ephemeral: true });
    }

    return interaction.reply({ content: 'Sous-commande invalide.', ephemeral: true });
  },
};
