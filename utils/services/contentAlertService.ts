import { Client, EmbedBuilder } from 'discord.js';
import cron, { type ScheduledTask } from 'node-cron';
import Logger from '../Logger';
import { ContentAlertRepository, type ContentAlert } from '../db';

type YouTubeChannelTarget =
  | { kind: 'channelId'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'custom'; value: string };

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
    if (!alert.lastContentId) {
      this.repository.updateById(alert.id, {
        lastContentId: latest.videoId,
        lastContentUrl: contentUrl,
        lastContentType: 'video',
      });
      return;
    }

    if (alert.lastContentId === latest.videoId) {
      return;
    }

    await this.sendAlertMessage({
      alert,
      channelName,
      url: contentUrl,
      type: 'video',
      providerLabel: 'YouTube',
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
      return;
    }

    const contentUrl = `https://www.twitch.tv/${user.login}`;
    if (!alert.lastContentId) {
      this.repository.updateById(alert.id, {
        lastContentId: stream.id,
        lastContentUrl: contentUrl,
        lastContentType: 'live',
      });
      return;
    }

    if (alert.lastContentId === stream.id) {
      return;
    }

    await this.sendAlertMessage({
      alert,
      channelName: user.displayName,
      url: contentUrl,
      type: 'live',
      providerLabel: 'Twitch',
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
  }): Promise<void> {
    const guild = await this.client.guilds.fetch(input.alert.guildId).catch(() => null);
    if (!guild) {
      return;
    }

    const channel = await guild.channels.fetch(input.alert.discordChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const isLive = input.type === 'live';
    const embed = new EmbedBuilder()
      .setColor(isLive ? 0x9146ff : 0xff0000)
      .setTitle(isLive ? `${input.channelName} est en live` : `${input.channelName} a sorti une vidéo`)
      .setDescription(`[Ouvrir ${input.providerLabel}](${input.url})`)
      .addFields(
        { name: 'Créateur', value: input.channelName, inline: true },
        { name: 'Type', value: isLive ? 'Live' : 'Vidéo', inline: true },
        { name: 'URL', value: input.url, inline: false },
      )
      .setTimestamp(new Date());

    await channel.send({
      content: input.alert.mention.trim().length ? input.alert.mention.trim() : undefined,
      embeds: [embed],
    });
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
  ): Promise<{ videoId: string; channelTitle: string } | null> {
    const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&maxResults=1&type=video&key=${encodeURIComponent(apiKey)}`;
    const data = await this.fetchJson<any>(endpoint);
    const item = data?.items?.[0];
    const videoId = item?.id?.videoId;
    if (!videoId) {
      return null;
    }

    return {
      videoId,
      channelTitle: item?.snippet?.channelTitle || '',
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
  ): Promise<{ id: string; login: string; displayName: string } | null> {
    const endpoint = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    if (!item?.id) {
      return null;
    }
    return { id: item.id, login: item.login, displayName: item.display_name };
  }

  private async fetchTwitchUserById(
    accessToken: string,
    clientId: string,
    id: string,
  ): Promise<{ id: string; login: string; displayName: string } | null> {
    const endpoint = `https://api.twitch.tv/helix/users?id=${encodeURIComponent(id)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    if (!item?.id) {
      return null;
    }
    return { id: item.id, login: item.login, displayName: item.display_name };
  }

  private async fetchTwitchStream(
    accessToken: string,
    clientId: string,
    userId: string,
  ): Promise<{ id: string } | null> {
    const endpoint = `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(userId)}`;
    const data = await this.fetchTwitchHelix(endpoint, accessToken, clientId);
    const item = data?.data?.[0];
    if (!item?.id) {
      return null;
    }

    return { id: item.id };
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
