const path = require("node:path");
const readline = require("node:readline/promises");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const prisma = require("../prismaClient");

function readMaskedPassword(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let password = "";
    const finish = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };

    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish();
          reject(new Error("Password reset cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          finish();
          resolve(password);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          const characters = Array.from(password);
          if (characters.length > 0) {
            characters.pop();
            password = characters.join("");
            process.stdout.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          password += character;
          process.stdout.write("*");
        }
      }
    };

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function resetAdminPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  const email = (
    process.env.ADMIN_RESET_EMAIL ||
    process.env.ADMIN_BOOTSTRAP_EMAIL ||
    ""
  ).trim().toLowerCase();

  if (!email) {
    throw new Error("Set ADMIN_RESET_EMAIL or ADMIN_BOOTSTRAP_EMAIL in backend/.env.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured in backend/.env.");
  }

  const admin = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, status: true }
  });

  if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") {
    throw new Error("The configured email does not belong to an active administrator.");
  }

  console.log(`Administrator account: ${admin.email}`);
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const confirmation = await prompt.question("Type RESET to continue: ");
  prompt.close();

  if (confirmation !== "RESET") {
    throw new Error("Password reset cancelled.");
  }

  const password = await readMaskedPassword("New password: ");
  const confirmationPassword = await readMaskedPassword("Confirm new password: ");

  if (password !== confirmationPassword) {
    throw new Error("Passwords do not match.");
  }

  const passwordLength = Buffer.byteLength(password, "utf8");
  if (passwordLength < 12 || passwordLength > 72) {
    throw new Error("Password must be between 12 and 72 UTF-8 bytes.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: {
        id: admin.id,
        role: "ADMIN",
        status: "ACTIVE"
      },
      data: { passwordHash }
    });

    if (result.count !== 1) {
      throw new Error("Administrator status changed; no password was updated.");
    }

    await tx.auditLog.create({
      data: {
        action: "ADMIN_PASSWORD_RESET",
        details: {
          targetUserId: admin.id,
          method: "local-cli"
        }
      }
    });
  });

  console.log("Administrator password reset successfully.");
}

resetAdminPassword()
  .catch((error) => {
    console.error("Admin password reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
