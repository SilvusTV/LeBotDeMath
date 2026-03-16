import { and, eq } from 'drizzle-orm';
import { getDb, type AppDb } from '../client';
import { contentAlert, type ContentAlert } from '../schema';

export type AlertProvider = 'youtube' | 'twitch';

type CreateContentAlertInput = {
  guildId: string;
  channelUrl: string;
  provider: AlertProvider;
  discordChannelId: string;
  mention?: string;
};

type UpdateContentAlertInput = {
  channelUrl?: string;
  provider?: AlertProvider;
  discordChannelId?: string;
  mention?: string;
  providerChannelId?: string | null;
  providerChannelName?: string | null;
  lastContentId?: string | null;
  lastContentUrl?: string | null;
  lastContentType?: string | null;
  lastAnnouncedAt?: string | null;
};

export class ContentAlertRepository {
  constructor(private readonly db: AppDb = getDb()) {}

  listAll(): ContentAlert[] {
    return this.db.select().from(contentAlert).all();
  }

  listByGuild(guildId: string): ContentAlert[] {
    return this.db.select().from(contentAlert).where(eq(contentAlert.guildId, guildId)).all();
  }

  findById(id: number): ContentAlert | undefined {
    return this.db.select().from(contentAlert).where(eq(contentAlert.id, id)).get();
  }

  create(input: CreateContentAlertInput): ContentAlert | undefined {
    this.db
      .insert(contentAlert)
      .values({
        guildId: input.guildId,
        channelUrl: input.channelUrl.trim(),
        provider: input.provider,
        discordChannelId: input.discordChannelId,
        mention: input.mention?.trim() || '',
      })
      .run();

    return this.db
      .select()
      .from(contentAlert)
      .where(
        and(
          eq(contentAlert.guildId, input.guildId),
          eq(contentAlert.provider, input.provider),
          eq(contentAlert.channelUrl, input.channelUrl.trim()),
          eq(contentAlert.discordChannelId, input.discordChannelId),
        ),
      )
      .get();
  }

  updateById(id: number, input: UpdateContentAlertInput): number {
    const setData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.channelUrl !== undefined) setData.channelUrl = input.channelUrl.trim();
    if (input.provider !== undefined) setData.provider = input.provider;
    if (input.discordChannelId !== undefined) setData.discordChannelId = input.discordChannelId;
    if (input.mention !== undefined) setData.mention = input.mention.trim();
    if (input.providerChannelId !== undefined) setData.providerChannelId = input.providerChannelId;
    if (input.providerChannelName !== undefined) setData.providerChannelName = input.providerChannelName;
    if (input.lastContentId !== undefined) setData.lastContentId = input.lastContentId;
    if (input.lastContentUrl !== undefined) setData.lastContentUrl = input.lastContentUrl;
    if (input.lastContentType !== undefined) setData.lastContentType = input.lastContentType;
    if (input.lastAnnouncedAt !== undefined) setData.lastAnnouncedAt = input.lastAnnouncedAt;

    const result = this.db.update(contentAlert).set(setData).where(eq(contentAlert.id, id)).run();
    return result.changes;
  }

  deleteById(id: number): number {
    const result = this.db.delete(contentAlert).where(eq(contentAlert.id, id)).run();
    return result.changes;
  }
}
