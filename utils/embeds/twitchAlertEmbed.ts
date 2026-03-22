import { EmbedBuilder } from 'discord.js';

/**
 * Configuration pour les embeds d'alertes Twitch
 */
export const TWITCH_EMBED_CONFIG = {
  COLOR: 0x9146ff, // Violet Twitch
  TITLE: (channelName: string) => `${channelName} est en live !`,
  DESCRIPTION: (url: string) => `[Ouvrir Twitch](${url})`,
  FIELDS: {
    CREATOR: 'Créateur',
    TYPE: 'Type',
    URL: 'URL',
  },
  TYPE_VALUE: 'Live',
} as const;

/**
 * Crée un embed pour une alerte de stream Twitch
 *
 * @param channelName - Nom du streamer
 * @param url - URL du stream Twitch
 * @returns EmbedBuilder configuré pour une alerte Twitch
 */
export function createTwitchLiveEmbed(channelName: string, url: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TWITCH_EMBED_CONFIG.COLOR)
    .setTitle(TWITCH_EMBED_CONFIG.TITLE(channelName))
    .setDescription(TWITCH_EMBED_CONFIG.DESCRIPTION(url))
    .addFields(
      { name: TWITCH_EMBED_CONFIG.FIELDS.CREATOR, value: channelName, inline: true },
      { name: TWITCH_EMBED_CONFIG.FIELDS.TYPE, value: TWITCH_EMBED_CONFIG.TYPE_VALUE, inline: true },
      { name: TWITCH_EMBED_CONFIG.FIELDS.URL, value: url, inline: false },
    )
    .setTimestamp(new Date());
}
