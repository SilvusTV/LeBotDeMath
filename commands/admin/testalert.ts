import { ApplicationCommandOptionType, ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { ContentAlertRepository } from '../../utils/db';
import { createTwitchLiveEmbed, createYouTubeVideoEmbed } from '../../utils/embeds';

export = {
  name: 'testalert',
  category: 'admin',
  ownerOnly: false,
  usage: 'testalert <alert_id> [channel]',
  examples: ['testalert 1', 'testalert 2 #test-channel'],
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  description: 'Envoie une alerte de test avec les données de la dernière alerte détectée.',
  options: [
    {
      name: 'alert_id',
      description: "ID de l'alerte à tester",
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: 'channel',
      description: 'Salon Discord où envoyer le test (par défaut: salon configuré)',
      type: ApplicationCommandOptionType.Channel,
      required: false,
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    },
  ],
  async runInteraction(client: any, interaction: any) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const repository = new ContentAlertRepository();
    const alertId = interaction.options.getInteger('alert_id', true);
    const testChannel = interaction.options.getChannel('channel');

    const alert = repository.findById(alertId);
    if (!alert) {
      return interaction.reply({
        content: `Alerte #${alertId} introuvable.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (alert.guildId !== interaction.guildId) {
      return interaction.reply({
        content: `Alerte #${alertId} n'appartient pas à ce serveur.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier qu'il y a des données à tester
    if (!alert.lastContentId || !alert.lastContentUrl) {
      return interaction.reply({
        content: `Alerte #${alertId} n'a pas encore détecté de contenu. Attendez qu'une première détection soit faite.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Déterminer le canal de destination
    const targetChannelId = testChannel?.id || alert.discordChannelId;
    const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.reply({
        content: 'Salon Discord invalide ou inaccessible.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Créer l'embed en fonction du provider
      let embed;
      if (alert.provider === 'twitch') {
        embed = createTwitchLiveEmbed(
          alert.providerChannelName || 'Streamer Twitch',
          alert.lastContentUrl,
        );
      } else {
        // Pour YouTube, on utilise des données de test car on n'a pas le titre stocké
        embed = createYouTubeVideoEmbed(
          alert.providerChannelName || 'Chaîne YouTube',
          alert.lastContentUrl,
          'Test - Dernière vidéo détectée',
          undefined, // Pas de thumbnail de chaîne
          undefined, // Pas de thumbnail de vidéo
        );
      }

      // Envoyer le message de test
      await targetChannel.send({
        content: `**🧪 TEST D'ALERTE** ${alert.mention.trim().length ? alert.mention.trim() : ''}`,
        embeds: [embed],
      });

      return interaction.reply({
        content: `✅ Alerte de test envoyée dans <#${targetChannelId}> pour l'alerte #${alertId} (${alert.provider}).`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error: any) {
      return interaction.reply({
        content: `❌ Erreur lors de l'envoi de l'alerte de test: ${error?.message || 'erreur inconnue'}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
