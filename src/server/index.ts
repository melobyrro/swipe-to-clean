import { createCacheStore } from './cache';
import { loadConfig } from './config';
import { AppDatabase } from './db';
import { ImmichClient } from './immich/client';
import { ReviewService } from './services/review-service';
import { createApp } from './app';

async function main() {
  const config = loadConfig();
  const database = new AppDatabase(config);
  if (config.nodeEnv === 'production' && !database.getImmichConnection() && !config.setupToken) {
    throw new Error('SETUP_TOKEN must be set before exposing a fresh production instance');
  }

  const cache = await createCacheStore(config.redisUrl, {
    useMemory: config.nodeEnv === 'test',
    fallbackToMemory: !config.redisRequired
  });
  const immich = new ImmichClient(database, config);
  const reviewService = new ReviewService(database, cache, immich);
  const app = createApp({
    config,
    database,
    cache,
    immich,
    reviewService
  });

  const server = app.listen(config.port, () => {
    console.log(`Swipe to Clean listening on http://127.0.0.1:${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await cache.disconnect();
    database.close();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
