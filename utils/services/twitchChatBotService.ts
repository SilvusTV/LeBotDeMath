import Logger from '../Logger';
import { TwitchCommandRepository } from '../db';

const tmi = require('tmi.js');

export class TwitchChatBotService {
  private readonly repository: TwitchCommandRepository;
  private client: any | null = null;
  private started = false;
  private readonly prefix = '!';

  constructor(repository?: TwitchCommandRepository) {
    this.repository = repository ?? new TwitchCommandRepository();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const channelName = this.normalizeChannelName(process.env.TWITCH_CHANNEL_NAME || '');
    const botName = (process.env.TWITCH_BOT_NAME || '').trim();
    const authToken = this.normalizeAuthToken(process.env.TWITCH_AUTH || '');
    const guildId = (process.env.TWITCH_COMMAND_GUILD_ID || '').trim();

    if (!channelName || !botName || !authToken || !guildId) {
      Logger.warn(
        'Twitch chat bot désactivé: TWITCH_CHANNEL_NAME, TWITCH_BOT_NAME, TWITCH_AUTH ou TWITCH_COMMAND_GUILD_ID manquant.',
      );
      return;
    }

    this.client = new tmi.Client({
      options: {
        debug: false,
      },
      identity: {
        username: botName,
        password: authToken,
      },
      channels: [channelName],
    });

    this.client.on('connected', (address: string, port: number) => {
      Logger.info(`Twitch chat connecté (${address}:${port}) sur #${channelName}`);
    });

    this.client.on('disconnected', (reason: string) => {
      Logger.warn(`Twitch chat déconnecté: ${reason}`);
    });

    this.client.on('message', (channel: string, tags: any, message: string, self: boolean) => {
      void this.handleMessage(channel, tags, message, self, guildId);
    });

    try {
      await this.client.connect();
      this.started = true;
    } catch (e: any) {
      Logger.error(`Connexion Twitch impossible: ${e?.message || e}`);
      this.client = null;
      this.started = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.disconnect();
    } catch (e: any) {
      Logger.warn(`Erreur lors de la fermeture Twitch chat: ${e?.message || e}`);
    } finally {
      this.client = null;
      this.started = false;
    }
  }

  private async handleMessage(channel: string, tags: any, message: string, self: boolean, guildId: string): Promise<void> {
    if (self || !this.client) {
      return;
    }

    if (!message.startsWith(this.prefix)) {
      return;
    }

    const raw = message.slice(this.prefix.length).trim();
    if (!raw.length) {
      return;
    }

    const commandName = raw.split(/\s+/)[0];
    const command = this.repository.findByCommand(guildId, commandName);
    if (!command || !command.isActive) {
      return;
    }

    try {
      const parentMessageId = typeof tags?.id === 'string' ? tags.id : '';
      if (parentMessageId && typeof this.client.reply === 'function') {
        await this.client.reply(channel, command.response, parentMessageId);
        return;
      }

      const username = (tags?.['display-name'] || tags?.username || '').toString().trim();
      const content = username ? `@${username} ${command.response}` : command.response;
      await this.client.say(channel, content);
    } catch (e: any) {
      Logger.error(`Impossible d'envoyer la réponse Twitch pour !${commandName}: ${e?.message || e}`);
    }
  }

  private normalizeChannelName(raw: string): string {
    return raw.trim().replace(/^#/, '').toLowerCase();
  }

  private normalizeAuthToken(raw: string): string {
    const value = raw.trim();
    if (!value.length) {
      return '';
    }

    return value.startsWith('oauth:') ? value : `oauth:${value}`;
  }
}
