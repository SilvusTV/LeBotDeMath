# Discord Bot (TypeScript)

Bot Discord base sur `discord.js` v14 avec:
- commandes slash chargees automatiquement,
- commandes prefixees stockees en base SQLite,
- alertes de contenu YouTube/Twitch (polling cron),
- bot de chat Twitch optionnel.

Le projet est ecrit en TypeScript et compile vers `dist/`.

## Prerequis

- Node.js 18+ (20+ recommande).
- Un bot Discord (token).
- SQLite (fichier local, cree automatiquement).

## Installation rapide

```bash
npm install
cp .env.example .env
```

Renseigne ensuite au minimum `DISCORD_TOKEN` dans `.env`.

Lancer en dev:

```bash
npm run dev
```

Build + run production:

```bash
npm run build
npm start
```

## Scripts NPM

- `npm run dev`: execution TypeScript via `ts-node`.
- `npm run build`: compilation TypeScript (`tsc`).
- `npm start`: execution de `dist/index.js`.

## Fonctionnalites principales

- Chargement auto des modules:
  - `commands/**`
  - `events/**`
  - `selects/**`
- Initialisation auto de la DB au `ready` (`DB/schema.sql`).
- Configuration par guilde (ex: prefix des commandes texte).
- Commandes custom Discord stockees en base.
- Commandes Twitch chat stockees en base.
- Alertes YouTube/Twitch vers un salon Discord via embeds.
- Arret propre du process (fermeture DB + service Twitch).

## Commandes incluses

Slash admin:
- `/config` (set/get/list des cles de config)
- `/customcommand` (create/list/update/delete)
- `/twitchcommand` (add/view/edit/delete)
- `/alert` (add/edit/delete/list)

Slash utilitaires/moderation:
- `/ping`
- `/uptime`
- `/clear`
- `/wrongchan`

Commandes texte (prefixees):
- Le prefix est configurable en base (`customCommandPrefix`, defaut `!`).
- Les commandes viennent des tables custom Discord + Twitch.

## Variables d'environnement

Variables principales:

```env
DISCORD_TOKEN=
DISCORD_BOT_NAME=discordBotKernel
DB_LOCATION=./DB/bot.db
```

Alertes YouTube/Twitch:

```env
YOUTUBE_API_KEY=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
ALERT_POLL_CRON_TWITCH=* * * * *
ALERT_POLL_CRON_YOUTUBE=*/30 11-22 * * *
```

Bot Twitch chat (optionnel):

```env
TWITCH_CHANNEL_NAME=
TWITCH_BOT_NAME=
TWITCH_AUTH=
TWITCH_COMMAND_GUILD_ID=
```

Si ces variables Twitch chat ne sont pas renseignees, le service reste desactive.

## Structure

```text
.
├─ commands/                  # commandes slash
├─ events/                    # listeners Discord
├─ selects/                   # handlers de select menus
├─ utils/
│  ├─ handlers/               # loaders Command/Event/Select
│  ├─ db/                     # client Drizzle + repositories + schema TS
│  └─ services/               # alertes contenu + bot chat Twitch
├─ DB/
│  ├─ schema.sql              # schema SQL source
│  └─ bot.db                  # DB SQLite locale
├─ index.ts
├─ ecosystem.config.js
└─ tsconfig.json
```

## PM2 (optionnel)

```bash
npm run build
pm2 start ecosystem.config.js --env production
pm2 logs
```

## Auteur et licence

- Auteur: `Silvus_tv`
- Licence: ISC (`LICENSE`)
