require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const prisma = require("../prismaClient");
const { generateAccountNumber } = require("../lib/accounts");

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";

test("PostgreSQL constraints and ledger transaction work without leaving fixture rows", {
  skip: !enabled && "Set DATABASE_INTEGRATION_TESTS=1 to run against the configured PostgreSQL database",
  timeout: 30000
}, async () => {
  const fixtureId = randomUUID();
  const rollbackSignal = new Error("Intentional database integration-test rollback");

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: fixtureId,
          name: "BalanceVault Integration Test",
          email: `test-${fixtureId}@example.invalid`,
          passwordHash: "not-a-real-password-hash",
          status: "ACTIVE"
        }
      });

      const source = await tx.account.create({
        data: {
          accountNo: generateAccountNumber(),
          userId: user.id,
          balance: 10000n
        }
      });
      const destination = await tx.account.create({
        data: {
          accountNo: generateAccountNumber(),
          userId: user.id
        }
      });

      await tx.$executeRaw`SAVEPOINT account_balance_constraint`;
      await assert.rejects(
        tx.$executeRaw`UPDATE "Account" SET "balance" = -1 WHERE "id" = ${source.id}`,
        (error) => error.code === "P2010" && error.meta?.code === "23514"
      );
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT account_balance_constraint`;

      const overdraft = await tx.account.updateMany({
        where: {
          id: source.id,
          balance: { gte: 10001n }
        },
        data: { balance: { decrement: 10001n } }
      });
      assert.equal(overdraft.count, 0);

      const amount = 1250n;
      const debit = await tx.account.updateMany({
        where: { id: source.id, balance: { gte: amount }, status: "ACTIVE" },
        data: { balance: { decrement: amount } }
      });
      const credit = await tx.account.updateMany({
        where: { id: destination.id, status: "ACTIVE" },
        data: { balance: { increment: amount } }
      });
      assert.equal(debit.count, 1);
      assert.equal(credit.count, 1);

      const referenceId = randomUUID();
      await tx.ledgerEntry.createMany({
        data: [
          { accountId: source.id, type: "DEBIT", amount, referenceId },
          { accountId: destination.id, type: "CREDIT", amount, referenceId }
        ]
      });

      await tx.$executeRaw`SAVEPOINT ledger_amount_constraint`;
      await assert.rejects(
        tx.$executeRaw`
          INSERT INTO "LedgerEntry" ("id", "accountId", "type", "amount", "referenceId")
          VALUES (${randomUUID()}, ${source.id}, 'DEBIT', 0, ${referenceId})
        `,
        (error) => error.code === "P2010" && error.meta?.code === "23514"
      );
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT ledger_amount_constraint`;

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "INTEGRATION_TEST_TRANSFER",
          details: { referenceId, amount: amount.toString() }
        }
      });

      const balances = await tx.account.findMany({
        where: { id: { in: [source.id, destination.id] } },
        orderBy: { id: "asc" },
        select: { balance: true }
      });
      assert.equal(balances.reduce((sum, account) => sum + account.balance, 0n), 10000n);

      const entries = await tx.ledgerEntry.findMany({
        where: { referenceId },
        orderBy: { type: "asc" }
      });
      assert.equal(entries.length, 2);
      assert(entries.every((entry) => entry.amount === amount));

      const audit = await tx.auditLog.findFirst({
        where: {
          actorId: user.id,
          action: "INTEGRATION_TEST_TRANSFER"
        }
      });
      assert(audit);

      throw rollbackSignal;
    }, { isolationLevel: "Serializable" }),
    (error) => error === rollbackSignal
  );

  assert.equal(await prisma.user.findUnique({ where: { id: fixtureId } }), null);
});
