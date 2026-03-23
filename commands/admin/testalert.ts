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

    // Répondre immédiatement pour éviter le timeout
    await interaction.reply({
      content: `⏳ Récupération des données pour l'alerte #${alertId}...`,
      flags: MessageFlags.Ephemeral,
    });

    try {
      // Créer l'embed en fonction du provider
      let embed;
      if (alert.provider === 'twitch') {
        embed = createTwitchLiveEmbed(
          alert.providerChannelName || 'Streamer Twitch',
          alert.lastContentUrl,
        );
      } else {
        // Pour YouTube, récupérer les vraies données depuis l'API
        const videoId = alert.lastContentId;
        const apiKey = process.env.YOUTUBE_API_KEY;

        let videoTitle = 'Test - Dernière vidéo détectée';
        let videoThumbnail: string | undefined;
        let channelThumbnail: string | undefined;

        if (apiKey && videoId) {
          try {
            // Récupérer les détails de la vidéo
            const videoResponse = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`,
            );
            const videoData = await videoResponse.json();
            const videoItem = videoData?.items?.[0];

            if (videoItem) {
              videoTitle = videoItem.snippet?.title || videoTitle;
              videoThumbnail = videoItem.snippet?.thumbnails?.high?.url || videoItem.snippet?.thumbnails?.medium?.url;

              // Récupérer la photo de profil de la chaîne
              const channelId = alert.providerChannelId;
              if (channelId) {
                const channelResponse = await fetch(
                  `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`,
                );
                const channelData = await channelResponse.json();
                channelThumbnail = channelData?.items?.[0]?.snippet?.thumbnails?.high?.url;
              }
            }
          } catch (e) {
            // En cas d'erreur, on continue avec les données par défaut
            console.error('Erreur lors de la récupération des données YouTube:', e);
          }
        }

        embed = createYouTubeVideoEmbed(
          alert.providerChannelName || 'Chaîne YouTube',
          alert.lastContentUrl,
          videoTitle,
          channelThumbnail,
          videoThumbnail,
        );
      }

      // Envoyer le message de test
      const mention = alert.mention.trim();
      const contentParts = ['**🧪 TEST D\'ALERTE**'];
      if (mention) {
        contentParts.push(mention);
      }
      // Pour YouTube, ajouter l'URL pour l'embed vidéo Discord
      if (alert.provider === 'youtube') {
        contentParts.push(alert.lastContentUrl);
      }

      await targetChannel.send({
        content: contentParts.join('\n'),
        embeds: [embed],
      });

      return interaction.editReply({
        content: `✅ Alerte de test envoyée dans <#${targetChannelId}> pour l'alerte #${alertId} (${alert.provider}).`,
      });
    } catch (error: any) {
      return interaction.editReply({
        content: `❌ Erreur lors de l'envoi de l'alerte de test: ${error?.message || 'erreur inconnue'}`,
      });
    }
  },
};
