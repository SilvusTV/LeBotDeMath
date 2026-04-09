import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

/**
 * Configuration pour les embeds d'alertes Twitch
 */
export const TWITCH_EMBED_CONFIG = {
  COLOR: 0x9146ff, // Violet Twitch
  TITLE_FALLBACK: (channelName: string) => `${channelName} est en live !`,
  FIELDS: {
    CATEGORY: 'Catégorie',
  },
  BUTTON_LABEL: 'Accéder à Twitch',
} as const;

/**
 * Crée un embed pour une alerte de stream Twitch
 *
 * @param input - Données du live Twitch
 * @returns EmbedBuilder configuré pour une alerte Twitch
 */
export function createTwitchLiveEmbed(input: {
  channelName: string;
  url: string;
  liveTitle?: string;
  channelProfileImage?: string;
  categoryName?: string;
  categoryImage?: string;
  streamPreviewImage?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(TWITCH_EMBED_CONFIG.COLOR)
    .setAuthor({
      name: input.channelName,
      iconURL: input.channelProfileImage,
    })
    .setTitle(input.liveTitle?.trim() || TWITCH_EMBED_CONFIG.TITLE_FALLBACK(input.channelName))
    .setURL(input.url)
    .setTimestamp(new Date());

  if (input.categoryName?.trim()) {
    embed.addFields({
      name: TWITCH_EMBED_CONFIG.FIELDS.CATEGORY,
      value: input.categoryName.trim(),
      inline: true,
    });
  }

  if (input.categoryImage) {
    embed.setThumbnail(input.categoryImage);
  }

  if (input.streamPreviewImage) {
    embed.setImage(input.streamPreviewImage);
  }

  return embed;
}

export function createTwitchAccessButtonRow(url: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(TWITCH_EMBED_CONFIG.BUTTON_LABEL)
      .setURL(url),
  );
}
