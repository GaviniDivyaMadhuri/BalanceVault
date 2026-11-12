const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { createClient } = require("redis");

const redisClient = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;
let redisConnectionPromise = null;

if (redisClient) {
  redisClient.on("error", (error) => {
    console.error("Redis rate-limit store error:", error.message);
  });
}

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ...(redisClient
    ? {
        store: new RedisStore({
        sendCommand: (...args) => sendRedisCommand(args)
        })
      }
    : {}),
  handler: (_req, res) => {
    res.status(429).json({
      message: "Too many authentication attempts. Try again later."
    });
  }
});

async function connectRateLimitStore() {
  if (process.env.NODE_ENV === "production" && !redisClient) {
    throw new Error("REDIS_URL must be configured in production");
  }

  if (redisClient) {
    if (!redisClient.isOpen && !redisConnectionPromise) {
      redisConnectionPromise = redisClient.connect().finally(() => {
        redisConnectionPromise = null;
      });
    }

    if (redisConnectionPromise) {
      await redisConnectionPromise;
    }
  }
}

async function sendRedisCommand(args) {
  await connectRateLimitStore();
  return redisClient.sendCommand(args);
}

async function checkRateLimitStore() {
  if (redisClient) {
    await redisClient.ping();
  }
}

async function closeRateLimitStore() {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
}

module.exports = {
  authRateLimit,
  checkRateLimitStore,
  closeRateLimitStore,
  connectRateLimitStore
};
