import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const config = sqliteTable(
  'config',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    guildKeyUnique: uniqueIndex('config_guild_key_unique').on(table.guildId, table.key),
  }),
);

export const customCommand = sqliteTable(
  'customCommand',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    title: text('title').notNull(),
    command: text('command').notNull(),
    description: text('description').notNull(),
    response: text('response').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    guildCommandUnique: uniqueIndex('customCommand_guild_command_unique').on(table.guildId, table.command),
  }),
);

export const twitchCommand = sqliteTable(
  'twitchCommand',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    title: text('title').notNull(),
    command: text('command').notNull(),
    description: text('description').notNull(),
    response: text('response').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    guildCommandUnique: uniqueIndex('twitchCommand_guild_command_unique').on(table.guildId, table.command),
  }),
);

export const contentAlert = sqliteTable(
  'contentAlert',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    channelUrl: text('channel_url').notNull(),
    provider: text('provider').$type<'youtube' | 'twitch'>().notNull(),
    discordChannelId: text('discord_channel_id').notNull(),
    mention: text('mention').notNull().default(''),
    providerChannelId: text('provider_channel_id'),
    providerChannelName: text('provider_channel_name'),
    lastContentId: text('last_content_id'),
    lastContentUrl: text('last_content_url'),
    lastContentType: text('last_content_type'),
    lastAnnouncedAt: text('last_announced_at'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    guildProviderUrlDiscordUnique: uniqueIndex('contentAlert_guild_provider_url_discord_unique').on(
      table.guildId,
      table.provider,
      table.channelUrl,
      table.discordChannelId,
    ),
  }),
);

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
export type CustomCommand = typeof customCommand.$inferSelect;
export type NewCustomCommand = typeof customCommand.$inferInsert;
export type TwitchCommand = typeof twitchCommand.$inferSelect;
export type NewTwitchCommand = typeof twitchCommand.$inferInsert;
export type ContentAlert = typeof contentAlert.$inferSelect;
export type NewContentAlert = typeof contentAlert.$inferInsert;
