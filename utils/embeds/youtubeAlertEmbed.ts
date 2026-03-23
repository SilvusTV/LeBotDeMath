import { EmbedBuilder } from 'discord.js';

/**
 * Configuration pour les embeds d'alertes YouTube
 */
export const YOUTUBE_EMBED_CONFIG = {
  COLOR: 0xff0000, // Rouge YouTube
  TITLE: (videoTitle: string) => videoTitle,
  DESCRIPTION: (channelName: string, url: string) => `**${channelName}** vient de sortir une vidéo !\n[Regarder sur YouTube](${url})`,
  FIELDS: {
    CREATOR: 'Créateur',
    TYPE: 'Type',
    URL: 'URL',
  },
  TYPE_VALUE: 'Vidéo',
} as const;

/**
 * Crée un embed pour une alerte de vidéo YouTube
 *
 * @param channelName - Nom de la chaîne YouTube
 * @param url - URL de la vidéo YouTube
 * @param videoTitle - Titre de la vidéo YouTube
 * @param channelThumbnail - URL de la photo de profil de la chaîne (optionnel)
 * @param videoThumbnail - URL de la miniature de la vidéo (optionnel)
 * @returns EmbedBuilder configuré pour une alerte YouTube
 */
export function createYouTubeVideoEmbed(
  channelName: string,
  url: string,
  videoTitle: string,
  channelThumbnail?: string,
  videoThumbnail?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(YOUTUBE_EMBED_CONFIG.COLOR)
    .setTitle(YOUTUBE_EMBED_CONFIG.TITLE(videoTitle))
    .setDescription(YOUTUBE_EMBED_CONFIG.DESCRIPTION(channelName, url))
    .setTimestamp(new Date());

  // Ajouter la photo de profil de la chaîne en tant qu'author icon
  if (channelThumbnail) {
    embed.setAuthor({
      name: channelName,
      iconURL: channelThumbnail,
    });
  }

  // Ajouter la miniature de la vidéo pour permettre l'embed vidéo
  if (videoThumbnail) {
    embed.setImage(videoThumbnail);
  }

  return embed;
}
