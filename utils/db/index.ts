export { ensureDatabaseInitialized } from './init';
export { getDb, closeDb, schema } from './client';
export { ConfigRepository, CONFIG_KEYS } from './repositories/configRepository';
export { CustomCommandRepository } from './repositories/customCommandRepository';
export { TwitchCommandRepository } from './repositories/twitchCommandRepository';
export { ContentAlertRepository } from './repositories/contentAlertRepository';
export type { AlertProvider } from './repositories/contentAlertRepository';
export type {
  Config,
  NewConfig,
  CustomCommand,
  NewCustomCommand,
  TwitchCommand,
  NewTwitchCommand,
  ContentAlert,
  NewContentAlert,
} from './schema';
