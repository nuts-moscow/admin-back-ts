import Redis from "ioredis";
import { ApplicationConfigs } from "../configs";

export class RedisClient {
  private static _instance: Redis | null = null;

  static async init(): Promise<Redis> {
    if (RedisClient._instance) {
      return RedisClient._instance;
    }
    const { url, db } = ApplicationConfigs.instance.redis;
    RedisClient._instance = new Redis(url, { db });
    await RedisClient._instance.ping();
    return RedisClient._instance;
  }

  static get instance(): Redis {
    if (!RedisClient._instance) {
      throw new Error(
        "RedisClient not initialized. Call init() at app start."
      );
    }
    return RedisClient._instance;
  }
}
