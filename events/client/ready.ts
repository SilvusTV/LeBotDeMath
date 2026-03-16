import { ActivityType } from 'discord.js';
import Logger from '../../utils/Logger';
import { ConfigRepository, ensureDatabaseInitialized } from '../../utils/db';
import { ContentAlertService } from '../../utils/services/contentAlertService';
import { TwitchChatBotService } from '../../utils/services/twitchChatBotService';

export = {
  name: 'clientReady',
  once: true,
  async execute(client: any) {
    // Ensure DB exists and is initialized from schema if missing
    await ensureDatabaseInitialized();
    const configRepository = new ConfigRepository();
    const guildsCount = await client.guilds.fetch();

    guildsCount.forEach((guild: any) => {
      configRepository.ensureDefaultGuildConfig(guild.id);
    });

    const watchingText = process.env.BOT_WATCHING_TEXT?.trim() || 'You';
    const applyPresence = () => {
      if (!client.user) {
        return;
      }
      client.user.setPresence({
        status: 'online',
        activities: [{ name: watchingText, type: ActivityType.Watching }],
      });
    };

    applyPresence();
    client.on('shardResume', applyPresence);
    client.on('shardReady', applyPresence);
    setInterval(applyPresence, 15 * 60 * 1000).unref();

    await client.application.commands.set(client.commands.map((cmd: any) => cmd));
    (client as any).contentAlertService = new ContentAlertService(client);
    (client as any).contentAlertService.start();
    (client as any).twitchChatBotService = new TwitchChatBotService();
    await (client as any).twitchChatBotService.start();

    Logger.client(
      `Bot ready on ${guildsCount.size} servers\n\n--------\n${process.env.DISCORD_BOT_NAME} ©2025\n--------\nAuthor:\n-Silvus\n--------\n`,
    );
  },
};
