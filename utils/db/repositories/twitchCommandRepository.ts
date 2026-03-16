import { and, eq, like } from 'drizzle-orm';
import { getDb, type AppDb } from '../client';
import { twitchCommand, type TwitchCommand } from '../schema';

type CreateTwitchCommandInput = {
  guildId: string;
  title: string;
  command: string;
  description: string;
  response: string;
};

type UpdateTwitchCommandInput = {
  title?: string;
  description?: string;
  response?: string;
  isActive?: boolean;
};

export class TwitchCommandRepository {
  constructor(private readonly db: AppDb = getDb()) {}

  normalizeCommandName(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, '-');
  }

  findByCommand(guildId: string, commandName: string): TwitchCommand | undefined {
    const normalized = this.normalizeCommandName(commandName);
    return this.db
      .select()
      .from(twitchCommand)
      .where(and(eq(twitchCommand.guildId, guildId), eq(twitchCommand.command, normalized)))
      .get();
  }

  listByGuild(guildId: string): TwitchCommand[] {
    return this.db.select().from(twitchCommand).where(eq(twitchCommand.guildId, guildId)).all();
  }

  listByGuildAndCommandLike(guildId: string, term: string): TwitchCommand[] {
    const normalized = this.normalizeCommandName(term);
    return this.db
      .select()
      .from(twitchCommand)
      .where(and(eq(twitchCommand.guildId, guildId), like(twitchCommand.command, `%${normalized}%`)))
      .all();
  }

  create(input: CreateTwitchCommandInput): TwitchCommand | undefined {
    const normalized = this.normalizeCommandName(input.command);
    this.db
      .insert(twitchCommand)
      .values({
        guildId: input.guildId,
        title: input.title.trim(),
        command: normalized,
        description: input.description.trim(),
        response: input.response,
        isActive: true,
      })
      .run();

    return this.findByCommand(input.guildId, normalized);
  }

  update(guildId: string, commandName: string, input: UpdateTwitchCommandInput): number {
    const normalized = this.normalizeCommandName(commandName);
    const result = this.db
      .update(twitchCommand)
      .set({
        ...input,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(twitchCommand.guildId, guildId), eq(twitchCommand.command, normalized)))
      .run();

    return result.changes;
  }

  delete(guildId: string, commandName: string): number {
    const normalized = this.normalizeCommandName(commandName);
    const result = this.db
      .delete(twitchCommand)
      .where(and(eq(twitchCommand.guildId, guildId), eq(twitchCommand.command, normalized)))
      .run();

    return result.changes;
  }
}
