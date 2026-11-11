
const prisma = require("../prismaClient");
require("dotenv").config();

async function bootstrapAdmin() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;

  if (!email) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL is missing from .env");
  }

  const normalizedEmail = email.trim().toLowerCase();

  await prisma.$transaction(async (tx) => {
    const adminCount = await tx.user.count({
      where: { role: "ADMIN" }
    });

    if (adminCount > 0) {
      throw new Error("An administrator already exists. Bootstrap blocked.");
    }

    const user = await tx.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      throw new Error("Register this user before running admin bootstrap.");
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE"
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "INITIAL_ADMIN_BOOTSTRAP",
        details: {
          method: "Local CLI bootstrap"
        }
      }
    });
  }, {
    isolationLevel: "Serializable"
  });

  console.log("Initial administrator activated successfully.");
}

bootstrapAdmin()
  .catch((error) => {
    console.error("Admin bootstrap failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
