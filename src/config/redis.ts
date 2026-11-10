import { Redis, RedisOptions } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

class RedisConnectionManager {
  private client: Redis | null = null;
  private isConnected = false;

  public getRedisOptions(): RedisOptions {
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        // Exponential backoff capped at 3000ms
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      lazyConnect: true,
    };
  }

  public getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(this.getRedisOptions());

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info(`Connected to Redis at ${env.REDIS_HOST}:${env.REDIS_PORT}`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        logger.warn(`Redis connection warning: ${err.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    }

    return this.client;
  }

  public isAvailable(): boolean {
    return this.isConnected;
  }

  public async connect(): Promise<boolean> {
    try {
      const client = this.getClient();
      if (client.status === 'wait' || client.status === 'close') {
        await client.connect();
      }
      this.isConnected = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      logger.warn(`Could not connect to Redis: ${(error as Error).message}. Running with graceful queue degradation.`);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // ignore
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }
}

export const redisManager = new RedisConnectionManager();
export const getRedisClient = () => redisManager.getClient();
