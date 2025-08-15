import Redis from 'ioredis';
import config from './environment';

class RedisClient {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.client.on('ready', () => {
      console.log('Redis is ready to receive commands');
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, expiration?: number): Promise<void> {
    if (expiration) {
      await this.client.setex(key, expiration, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async setJson(key: string, value: object, expiration?: number): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await this.set(key, jsonValue, expiration);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Error parsing JSON from Redis:', error);
      return null;
    }
  }
}

export const redisClient = new RedisClient();
export default redisClient;