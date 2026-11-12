require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const dotenv = require("dotenv");
const { PrismaClient } = require("../generated/prisma");

const envPath = path.join(__dirname, "..", ".env");
const envFile = fs.readFileSync(envPath, "utf8");
const envValues = dotenv.parse(envFile);
const migrationUrl = envValues.MIGRATION_DATABASE_URL || envValues.DATABASE_URL;

if (!migrationUrl) {
  throw new Error("Set DATABASE_URL to the database owner connection before provisioning");
}

const client = new PrismaClient({
  datasources: { db: { url: migrationUrl } }
});

function replaceEnvironmentValue(contents, key, value) {
  const expression = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (expression.test(contents)) {
    return contents.replace(expression, `${key}=${value}`);
  }

  return `${contents.trimEnd()}\n${key}=${value}\n`;
}

async function provisionRuntimeRole() {
  const existingRoles = await client.$queryRaw`
    SELECT rolname FROM pg_roles WHERE rolname = 'balancevault_app'
  `;

  if (existingRoles.length > 0) {
    throw new Error(
      "balancevault_app already exists; refusing to rotate its password automatically"
    );
  }

  const password = randomBytes(32).toString("base64url");
  await client.$executeRawUnsafe(
    `CREATE ROLE balancevault_app LOGIN PASSWORD '${password}'`
  );

  try {
    await client.$executeRawUnsafe(
      "GRANT balancevault_runtime TO balancevault_app"
    );
  } catch (error) {
    await client.$executeRawUnsafe("DROP ROLE balancevault_app");
    throw error;
  }

  const runtimeUrl = new URL(migrationUrl);
  runtimeUrl.username = "balancevault_app";
  runtimeUrl.password = password;

  let updatedEnv = replaceEnvironmentValue(
    envFile,
    "DATABASE_URL",
    runtimeUrl.toString()
  );
  updatedEnv = replaceEnvironmentValue(
    updatedEnv,
    "MIGRATION_DATABASE_URL",
    migrationUrl
  );

  try {
    fs.writeFileSync(envPath, updatedEnv, { mode: 0o600 });
  } catch (error) {
    await client.$executeRawUnsafe("DROP ROLE balancevault_app");
    throw error;
  }

  console.log("Created the least-privilege app login and updated backend/.env.");
  console.log("Keep backend/.env private; it contains the runtime database credential.");
}

provisionRuntimeRole()
  .catch((error) => {
    console.error("Runtime database role provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.$disconnect();
  });
