
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const prisma = require("./prismaClient");
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/accounts");
const adminRoutes = require("./routes/admin");
const {
  checkRateLimitStore,
  closeRateLimitStore,
  connectRateLimitStore
} = require("./middleware/rateLimit");

const app = express();
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error("FRONTEND_ORIGIN must be configured in production");
}

app.use(cors({
  origin(origin, callback) {
    const developmentOrigins = [
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ];
    const permittedOrigins = allowedOrigins.length ? allowedOrigins : developmentOrigins;

    callback(null, !origin || permittedOrigins.includes(origin));
  }
}));
app.use(express.json({ limit: "10kb" }));

app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to BalanceVault API",
    status: "running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "BalanceVault Backend"
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      checkRateLimitStore()
    ]);

    return res.status(200).json({ status: "ready" });
  } catch (error) {
    console.error("Readiness check failed:", error.message);
    return res.status(503).json({ status: "not_ready" });
  }
});

app.use((_req, res) => {
  return res.status(404).json({ message: "Route not found" });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error.message);
  return res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectRateLimitStore();

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(PORT, () => resolve(listener));
    listener.once("error", reject);
  });

  console.log(`BalanceVault API running on port ${PORT}`);

  const shutdown = () => {
    server.close(async (error) => {
      if (error) {
        console.error("Server shutdown error:", error.message);
        process.exitCode = 1;
      }

      await Promise.all([
        prisma.$disconnect(),
        closeRateLimitStore()
      ]);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Unable to start BalanceVault API:", error.message);
    process.exitCode = 1;
  });
}

app.startServer = startServer;
module.exports = app;
