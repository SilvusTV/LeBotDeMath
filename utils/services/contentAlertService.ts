import {
  ActionRowBuilder,
  ButtonBuilder,
  Client,
  Guild,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
} from 'discord.js';
import cron, { type ScheduledTask } from 'node-cron';
import Logger from '../Logger';
import { ContentAlertRepository, type ContentAlert } from '../db';
import {
  createTwitchAccessButtonRow,
  createTwitchLiveEmbed,
  createYouTubeAccessButtonRow,
  createYouTubeVideoEmbed,
} from '../embeds';

type YouTubeChannelTarget =
  | { kind: 'channelId'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'custom'; value: string };

type TwitchUser = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
};

type TwitchStream = {
  id: string;
  title: string;
  gameId: string;
  gameName: string;
  thumbnailUrl: string;
  startedAt: string;
};

type ActiveTwitchLiveState = {
  streamId: string;
  scheduledEventId: string | null;
};

export class ContentAlertService {
  private readonly repository: ContentAlertRepository;
  private twitchTask: ScheduledTask | null = null;
  private youtubeTask: ScheduledTask | null = null;
  private isPollingTwitch = false;
  private isPollingYouTube = false;
  private twitchAccessToken: string | null = null;
  private twitchTokenExpiresAt = 0;
  private youtubeKeyMissingWarned = false;
  private twitchCredsMissingWarned = false;
  private readonly activeTwitchLives = new Map<number, ActiveTwitchLiveState>();

  constructor(private readonly client: Client, repository?: ContentAlertRepository) {
    this.repository = repository ?? new ContentAlertRepository();
  }

  start(): void {
    if (this.twitchTask || this.youtubeTask) {
      return;
    }

    const twitchCron = process.env.ALERT_POLL_CRON_TWITCH || process.env.ALERT_POLL_CRON || '* * * * *';
    const youtubeCron =
      process.env.ALERT_POLL_CRON_YOUTUBE || '*/30 11-22 * * *';

    if (!cron.validate(twitchCron)) {
      Logger.warn(`ALERT_POLL_CRON_TWITCH invalide (${twitchCron}), fallback sur * * * * *`);
    }
    if (!cron.validate(youtubeCron)) {
      Logger.warn(`ALERT_POLL_CRON_YOUTUBE invalide (${youtubeCron}), fallback sur */30 11-22 * * *`);
    }

    this.twitchTask = cron.schedule(cron.validate(twitchCron) ? twitchCron : '* * * * *', () => {
      void this.pollProvider('twitch');
    });

    this.youtubeTask = cron.schedule(cron.validate(youtubeCron) ? youtubeCron : '*/30 11-22 * * *', () => {
      void this.pollProvider('youtube');
    });

    void this.pollProvider('twitch');
    void this.pollProvider('youtube');
  }

  async pollProvider(provider: 'youtube' | 'twitch'): Promise<void> {
    if (provider === 'youtube' && this.isPollingYouTube) {
      return;
    }
    if (provider === 'twitch' && this.isPollingTwitch) {
      return;
    }

    if (provider === 'youtube') {
      this.isPollingYouTube = true;
    } else {
      this.isPollingTwitch = true;
    }

    try {
      const allAlerts = this.repository.listAll();
      let alerts = allAlerts.filter((alert) => alert.provider === provider);
      if (provider === 'youtube' && alerts.length > 4) {
        Logger.warn(`Plus de 4 alertes YouTube détectées (${alerts.length}). Seules les 4 premières seront traitées.`);
        alerts = alerts.sort((a, b) => a.id - b.id).slice(0, 4);
      }

      for (const alert of alerts) {

        try {
          if (alert.provider === 'youtube') {
            await this.processYouTubeAlert(alert);
          } else {
            await this.processTwitchAlert(alert);
          }
        } catch (e: any) {
          Logger.error(`Erreur alert #${alert.id}: ${e?.message || e}`);
        }
      }
    } finally {
      if (provider === 'youtube') {
        this.isPollingYouTube = false;
      } else {
        this.isPollingTwitch = false;
      }
    }
  }

  private async processYouTubeAlert(alert: ContentAlert): Promise<void> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      if (!this.youtubeKeyMissingWarned) {
        this.youtubeKeyMissingWarned = true;
        Logger.warn('YOUTUBE_API_KEY manquant: alertes YouTube désactivées.');
      }
      return;
    }

    let channelId = alert.providerChannelId || null;
    let channelName = alert.providerChannelName || null;

    if (!channelId) {
      const target = this.parseYouTubeChannelTarget(alert.channelUrl);
      if (!target) {
        Logger.warn(`URL YouTube invalide pour alert #${alert.id}: ${alert.channelUrl}`);
        return;
      }

      const resolved = await this.resolveYouTubeChannel(target, apiKey);
      if (!resolved) {
        Logger.warn(`Impossible de résoudre la chaîne YouTube (${alert.channelUrl})`);
        return;
      }

      channelId = resolved.id;
      channelName = resolved.title;
      this.repository.updateById(alert.id, {
        providerChannelId: channelId,
        providerChannelName: channelName || null,
      });
    }

    const latest = await this.fetchLatestYouTubeVideo(channelId, apiKey);
    if (!latest) {
      return;
    }

    if (!channelName) {
      channelName = latest.channelTitle || 'Chaîne YouTube';
      this.repository.updateById(alert.id, {
        providerChannelName: channelName,
      });
    }

    const contentUrl = `https://www.youtube.com/watch?v=${latest.videoId}`;

    // Si c'est la même vidéo qu'avant, on ne fait rien
    if (alert.lastContentId === latest.videoId) {
      return;
    }

    // Nouvelle vidéo détectée (ou première vidéo) : on envoie une notification
    await this.sendAlertMessage({
      alert,
      channelName,
      url: contentUrl,
      type: 'video',
      providerLabel: 'YouTube',
      title: latest.videoTitle,
      channelThumbnail: latest.channelThumbnail,
      videoThumbnail: latest.videoThumbnail,
    });

    this.repository.updateById(alert.id, {
      providerChannelName: channelName,
      lastContentId: latest.videoId,
      lastContentUrl: contentUrl,
      lastContentType: 'video',
      lastAnnouncedAt: new Date().toISOString(),
    });
  }

  private async processTwitchAlert(alert: ContentAlert): Promise<void> {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      if (!this.twitchCredsMissingWarned) {
        this.twitchCredsMissingWarned = true;
        Logger.warn('TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET manquants: alertes Twitch désactivées.');
      }
      return;
    }

    const accessToken = await this.getTwitchAccessToken(clientId, clientSecret);
    if (!accessToken) {
      return;
    }

    const login = this.parseTwitchLogin(alert.channelUrl);
    if (!login && !alert.providerChannelId) {
      Logger.warn(`URL Twitch invalide pour alert #${alert.id}: ${alert.channelUrl}`);
      return;
    }

    const user = alert.providerChannelId
      ? await this.fetchTwitchUserById(accessToken, clientId, alert.providerChannelId)
      : await this.fetchTwitchUserByLogin(accessToken, clientId, login as string);

    if (!user) {
      Logger.warn(`Impossible de résoudre la chaîne Twitch (${alert.channelUrl})`);
      return;
    }

    if (alert.providerChannelId !== user.id || alert.providerChannelName !== user.displayName) {
      this.repository.updateById(alert.id, {
        providerChannelId: user.id,
        providerChannelName: user.displayName,
      });
    }

    const stream = await this.fetchTwitchStream(accessToken, clientId, user.id);
    if (!stream) {
      await this.handleTwitchLiveEnded(alert, user.displayName);
      return;
    }

    const contentUrl = `https://www.twitch.tv/${user.login}`;
    const streamPreview = this.formatTwitchStreamPreviewUrl(stream.thumbnailUrl);
    const categoryImage = stream.gameId
      ? await this.fetchTwitchGameBoxArt(accessToken, clientId, stream.gameId)
      : null;

    const scheduledEventId = await this.ensureTwitchLiveEvent(alert, user, stream, contentUrl);
    this.activeTwitchLives.set(alert.id, {
      streamId: stream.id,
      scheduledEventId,
    });

    // Si c'est le même stream qu'avant, on ne fait rien
    if (alert.lastContentId === stream.id) {
      return;
    }

    // Nouveau stream détecté (ou premier stream) : on envoie une notification
    await this.sendAlertMessage({
      alert,
      channelName: user.displayName,
      url: contentUrl,
      type: 'live',
      providerLabel: 'Twitch',
      title: stream.title || undefined,
      channelThumbnail: user.profileImageUrl,
      videoThumbnail: streamPreview,
      twitchCategory: stream.gameName || undefined,
      twitchCategoryImage: categoryImage || undefined,
    });

    this.repository.updateById(alert.id, {
      providerChannelId: user.id,
      providerChannelName: user.displayName,
      lastContentId: stream.id,
      lastContentUrl: contentUrl,
      lastContentType: 'live',
      lastAnnouncedAt: new Date().toISOString(),
    });
  }

  private async sendAlertMessage(input: {
    alert: ContentAlert;
    channelName: string;
    url: string;
    type: 'video' | 'live';
    providerLabel: 'YouTube' | 'Twitch';
    title?: string;
    channelThumbnail?: string;
    videoThumbnail?: string;
    twitchCategory?: string;
    twitchCategoryImage?: string;
  }): Promise<void> {
    const guild = await this.client.guilds.fetch(input.alert.guildId).catch(() => null);
    if (!guild) {
      return;
    }

    const channel = await guild.channels.fetch(input.alert.discordChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const embed =
      input.providerLabel === 'Twitch'
        ? createTwitchLiveEmbed({
            channelName: input.channelName,
            url: input.url,
            liveTitle: input.title,
            channelProfileImage: input.channelThumbnail,
            categoryName: input.twitchCategory,
            categoryImage: input.twitchCategoryImage,
            streamPreviewImage: input.videoThumbnail,
          })
        : createYouTubeVideoEmbed(
            input.channelName,
            input.url,
            input.title || 'Sans titre',
            input.channelThumbnail,
            input.videoThumbnail,
          );
    const accessButtonRow: ActionRowBuilder<ButtonBuilder> =
      input.providerLabel === 'Twitch'
        ? createTwitchAccessButtonRow(input.url)
        : createYouTubeAccessButtonRow(input.url);

    // Pour YouTube, on ajoute l'URL dans le content pour l'embed vidéo Discord
    const mention = input.alert.mention.trim();
    const contentParts = [];
    if (mention) {
      contentParts.push(mention);
    }
    if (input.providerLabel === 'YouTube') {
      contentParts.push(input.url);
    }

    await channel.send({
      content: contentParts.length > 0 ? contentParts.join('\n') : undefined,
      embeds: [embed],
      components: [accessButtonRow],
    });
  }

  private async ensureTwitchLiveEvent(
    alert: ContentAlert,
    user: TwitchUser,
    stream: TwitchStream,
    streamUrl: string,
  ): Promise<string | null> {
    const activeState = this.activeTwitchLives.get(alert.id);
    if (activeState && activeState.streamId === stream.id) {
      return activeState.scheduledEventId;
    }

    const guild = await this.client.guilds.fetch(alert.guildId).catch(() => null);
    if (!guild) {
      return null;
    }

    const eventName = this.buildTwitchLiveEventName(user.displayName);
    const existing = await this.findActiveTwitchLiveEvent(guild, eventName);
    if (existing) {
      return existing.id;
    }

    const createdEvent = await guild.scheduledEvents
      .create({
        name: eventName,
        description: stream.title || `${user.displayName} est actuellement en live sur Twitch.`,
        scheduledStartTime: stream.startedAt || new Date().toISOString(),
        scheduledEndTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: streamUrl },
      })
      .catch((e: any) => {
        Logger.warn(`Impossible de créer l'évènement Discord pour le live Twitch #${alert.id}: ${e?.message || e}`);
        return null;
      });

    return createdEvent?.id ?? null;
  }

  private async handleTwitchLiveEnded(alert: ContentAlert, channelName: string): Promise<void> {
    const activeState = this.activeTwitchLives.get(alert.id);
    if (activeState?.scheduledEventId) {
      await this.completeTwitchLiveEventById(alert.guildId, activeState.scheduledEventId);
    }
    this.activeTwitchLives.delete(alert.id);

    // Couverture des redémarrages: on termine aussi les évènements actifs portant le nom attendu.
    await this.completeMatchingTwitchLiveEvents(alert.guildId, channelName);
  }

  private buildTwitchLiveEventName(channelName: string): string {
    return `🔴 ${channelName} est en live sur Twitch`;
  }

  private async findActiveTwitchLiveEvent(guild: Guild, eventName: string): Promise<any | null> {
    const events = await guild.scheduledEvents.fetch().catch(() => null);
    if (!events) {
      return null;
    }

    return (
      events.find(
        (event) =>
          event.name === eventName &&
          (event.status === GuildScheduledEventStatus.Active || event.status === GuildScheduledEventStatus.Scheduled),
      ) || null
    );
  }

  private async completeTwitchLiveEventById(guildId: string, eventId: string): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return;
    }

    const event = await guild.scheduledEvents.fetch(eventId).catch(() => null);
    if (!event) {
      return;
    }

    await this.completeTwitchLiveEvent(event);
  }

  private async completeMatchingTwitchLiveEvents(guildId: string, channelName: string): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return;
    }

    const eventName = this.buildTwitchLiveEventName(channelName);
    const events = await guild.scheduledEvents.fetch().catch(() => null);
    if (!events) {
      return;
    }

    for (const event of events.values()) {
      if (
        event.name === eventName &&
        (event.status === GuildScheduledEventStatus.Active || event.status === GuildScheduledEventStatus.Scheduled)
      ) {
        await this.completeTwitchLiveEvent(event);
      }
    }
  }

  private async completeTwitchLiveEvent(event: any): Promise<void> {
    await event
      .edit({
        scheduledEndTime: new Date().toISOString(),
        status: GuildScheduledEventStatus.Completed,
      })
      .catch((e: any) => {
        Logger.warn(`Impossible de clôturer l'évènement Discord Twitch (${event?.id || 'unknown'}): ${e?.message || e}`);
      });
  }

  private formatTwitchStreamPreviewUrl(templateUrl: string): string {
    if (!templateUrl) {
      return '';
    }

    const withSize = templateUrl.replace('{width}', '1280').replace('{height}', '720');
    return `${withSize}?t=${Date.now()}`;
  }

  private parseYouTubeChannelTarget(channelUrl: string): YouTubeChannelTarget | null {
    const parsed = this.parseUrl(channelUrl);
    if (!parsed) {
      return null;
    }

    if (!parsed.hostname.includes('youtube.com')) {
      return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (!pathParts.length) {
      return null;
    }

    if (pathParts[0] === 'channel' && pathParts[1]) {
      return { kind: 'channelId', value: pathParts[1] };
    }

    if (pathParts[0].startsWith('@')) {
      return { kind: 'handle', value: pathParts[0].slice(1) };
    }

    if ((pathParts[0] === 'c' || pathParts[0] === 'user') && pathParts[1]) {
      return { kind: 'custom', value: pathParts[1] };
    }

    return null;
  }

  private parseTwitchLogin(channelUrl: string): string | null {
    const parsed = this.parseUrl(channelUrl);
    if (!parsed) {
      return null;
    }

    if (!parsed.hostname.includes('twitch.tv')) {
      return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (!pathParts.length) {
      return null;
    }

    const login = pathParts[0].toLowerCase();
    if (!/^[a-z0-9_]{3,25}$/.test(login)) {
      return null;
    }

    return login;
  }

  private parseUrl(input: string): URL | null {
    const trimmed = input.trim();
    if (!trimmed.length) {
      return null;
    }

    try {
      return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } catch {
      return null;
    }
  }

  private async resolveYouTubeChannel(
    target: YouTubeChannelTarget,
    apiKey: string,
  ): Promise<{ id: string; title: string } | null> {
    if (target.kind === 'channelId') {
      const endpoint = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&id=${encodeURIComponent(target.value)}&key=${encodeURIComponent(apiKey)}`;
      const data = await this.fetchJson<any>(endpoint);
      const item = data?.items?.[0];
      if (!item?.id) {
        return null;
      }
      return { id: item.id, title: item.snippet?.title || target.value };
    }

    if (target.kind === 'handle') {
      const endpoint = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(target.value)}&key=${encodeURIComponent(apiKey)}`;
      const data = await this.fetchJson<any>(endpoint);
      const item = data?.items?.[0];
      if (!item?.id) {
        return null;
      }
      return { id: item.id, title: item.snippet?.title || target.value };
    }

    const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(target.value)}&maxResults=1&key=${encodeURIComponent(apiKey)}`;
    const data = await this.fetchJson<any>(endpoint);
    const item = data?.items?.[0];
    if (!item?.id?.channelId) {
      return null;
    }

    return { id: item.id.channelId, title: item.snippet?.channelTitle || target.value };
  }

  private async fetchLatestYouTubeVideo(
    channelId: string,
    apiKey: string,
  ): Promise<{ videoId: string; channelTitle: string; videoTitle: string; channelThumbnail: string; videoThumbnail: string } | null> {
    const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&maxResults=1&type=video&key=${encodeURIComponent(apiKey)}`;
    const data = await this.fetchJson<any>(endpoint);
    const item = data?.items?.[0];
    const videoId = item?.id?.videoId;
    if (!videoId) {
      return null;
    }

    // Récupérer les détails de la chaîne pour avoir la photo de profil
    const channelEndpoint = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
    const channelData = await this.fetchJson<any>(channelEndpoint);
    const channelThumbnail = channelData?.items?.[0]?.snippet?.thumbnails?.high?.url || '';

    return {
      videoId,
      channelTitle: item?.snippet?.channelTitle || '',
      videoTitle: item?.snippet?.title || 'Sans titre',
      channelThumbnail,
      videoThumbnail: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url || '',
    };
  }

  private async getTwitchAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
    if (this.twitchAccessToken && Date.now() < this.twitchTokenExpiresAt - 60_000) {
      return this.twitchAccessToken;
    }

    const endpoint = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
    const data = await this.fetchJson<any>(endpoint, { method: 'POST' });
    if (!data?.access_token || !data?.expires_in) {
      Logger.error('Impossible de récupérer un token Twitch.');
      return null;
    }

    this.twitchAccessToken = data.access_token;
    this.twitchTokenExpiresAt = Date.now() + Number(data.expires_in) * 1000;
    return this.twitchAccessToken;
  }

  private async fetchTwitchUserByLogin(
    accessToken: string,
    clientId: string,
    login: string,
  ): Promise<TwitchUser | null> {
    const endpoint = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    if (!item?.id) {
      return null;
    }
    return {
      id: item.id,
      login: item.login,
      displayName: item.display_name,
      profileImageUrl: item.profile_image_url,
    };
  }

  private async fetchTwitchUserById(
    accessToken: string,
    clientId: string,
    id: string,
  ): Promise<TwitchUser | null> {
    const endpoint = `https://api.twitch.tv/helix/users?id=${encodeURIComponent(id)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    if (!item?.id) {
      return null;
    }
    return {
      id: item.id,
      login: item.login,
      displayName: item.display_name,
      profileImageUrl: item.profile_image_url,
    };
  }

  private async fetchTwitchStream(
    accessToken: string,
    clientId: string,
    userId: string,
  ): Promise<TwitchStream | null> {
    const endpoint = `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(userId)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    if (!item?.id) {
      return null;
    }

    return {
      id: item.id,
      title: item.title || '',
      gameId: item.game_id || '',
      gameName: item.game_name || 'Sans catégorie',
      thumbnailUrl: item.thumbnail_url || '',
      startedAt: item.started_at || new Date().toISOString(),
    };
  }

  private async fetchTwitchGameBoxArt(
    accessToken: string,
    clientId: string,
    gameId: string,
  ): Promise<string | null> {
    const endpoint = `https://api.twitch.tv/helix/games?id=${encodeURIComponent(gameId)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    const boxArt = item?.box_art_url;
    if (!boxArt) {
      return null;
    }

    return boxArt.replace('{width}', '285').replace('{height}', '380');
  }

  private async fetchTwitchHelix(url: string, accessToken: string, clientId: string): Promise<any> {
    const data = await this.fetchJson<any>(url, {
      headers: {
        'Client-Id': clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return data;
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const text = await response.text();
        Logger.warn(`HTTP ${response.status} sur ${url}: ${text.slice(0, 200)}`);
        return null;
      }

      return (await response.json()) as T;
    } catch (e: any) {
      Logger.error(`Erreur HTTP ${url}: ${e?.message || e}`);
      return null;
    }
  }
}
