
const prisma = require("./prismaClient");

async function testConnection() {
  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL successfully.");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
