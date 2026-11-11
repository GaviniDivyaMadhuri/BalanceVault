const express = require("express");
const { randomUUID } = require("node:crypto");
const prisma = require("../prismaClient");
const { accountHolderOnly, authenticate } = require("../middleware/authMiddleware");
const { generateAccountNumber } = require("../lib/accounts");
const { formatMinorUnits, parseAmountToMinorUnits } = require("../lib/money");

const router = express.Router();
router.use(authenticate, accountHolderOnly);

function serializeAccount(account) {
  return {
    ...account,
    balance: formatMinorUnits(account.balance)
  };
}

router.get("/", async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        accountNo: true,
        balance: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" }
    });

    return res.status(200).json({ accounts: accounts.map(serializeAccount) });
  } catch (error) {
    console.error("Fetch accounts error:", error.message);
    return res.status(500).json({ message: "Unable to fetch accounts" });
  }
});

router.post("/", async (req, res) => {
  try {
    const account = await prisma.$transaction(async (tx) => {
      const createdAccount = await tx.account.create({
        data: {
          accountNo: generateAccountNumber(),
          userId: req.user.id
        },
        select: {
          id: true,
          accountNo: true,
          balance: true,
          status: true,
          createdAt: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ACCOUNT_OPENED",
          details: { accountId: createdAccount.id }
        }
      });

      return createdAccount;
    });

    return res.status(201).json({
      message: "Account opened successfully",
      account: serializeAccount(account)
    });
  } catch (error) {
    console.error("Open account error:", error.message);
    return res.status(500).json({ message: "Unable to open account" });
  }
});

router.get("/:id/ledger", async (req, res) => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true }
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        referenceId: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return res.status(200).json({
      entries: entries.map((entry) => ({
        ...entry,
        amount: formatMinorUnits(entry.amount)
      }))
    });
  } catch (error) {
    console.error("Fetch account ledger error:", error.message);
    return res.status(500).json({ message: "Unable to fetch account ledger" });
  }
});

router.post("/:id/transfers", async (req, res) => {
  const { destinationAccountNo, amount, description } = req.body;

  if (
    typeof destinationAccountNo !== "string" ||
    !/^\d{14}$/.test(destinationAccountNo) ||
    (description !== undefined &&
      (typeof description !== "string" || description.trim().length > 160))
  ) {
    return res.status(400).json({ message: "Invalid transfer details" });
  }

  let amountMinor;
  try {
    amountMinor = parseAmountToMinorUnits(amount);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const referenceId = randomUUID();
  const cleanDescription = description?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const source = await tx.account.findFirst({
        where: {
          id: req.params.id,
          userId: req.user.id
        },
        select: { id: true, status: true }
      });

      if (!source) {
        return { error: "Source account not found", status: 404 };
      }

      if (source.status !== "ACTIVE") {
        return { error: "Source account is not active", status: 409 };
      }

      const destination = await tx.account.findUnique({
        where: { accountNo: destinationAccountNo },
        select: {
          id: true,
          accountNo: true,
          status: true,
          user: { select: { status: true } }
        }
      });

      if (
        !destination ||
        destination.status !== "ACTIVE" ||
        destination.user.status !== "ACTIVE"
      ) {
        return { error: "Destination account is unavailable", status: 404 };
      }

      if (source.id === destination.id) {
        return { error: "Source and destination accounts must differ", status: 400 };
      }

      const debit = await tx.account.updateMany({
        where: {
          id: source.id,
          userId: req.user.id,
          status: "ACTIVE",
          balance: { gte: amountMinor }
        },
        data: { balance: { decrement: amountMinor } }
      });

      if (debit.count !== 1) {
        return { error: "Insufficient funds or source account unavailable", status: 409 };
      }

      const credit = await tx.account.updateMany({
        where: { id: destination.id, status: "ACTIVE" },
        data: { balance: { increment: amountMinor } }
      });

      if (credit.count !== 1) {
        throw new Error("Destination account changed during transfer");
      }

      await tx.ledgerEntry.createMany({
        data: [
          {
            accountId: source.id,
            type: "DEBIT",
            amount: amountMinor,
            description: cleanDescription,
            referenceId
          },
          {
            accountId: destination.id,
            type: "CREDIT",
            amount: amountMinor,
            description: cleanDescription,
            referenceId
          }
        ]
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "TRANSFER_COMPLETED",
          details: {
            referenceId,
            sourceAccountId: source.id,
            destinationAccountId: destination.id,
            amount: amountMinor.toString()
          }
        }
      });

      const [sourceAfter, destinationAfter] = await Promise.all([
        tx.account.findUnique({ where: { id: source.id }, select: { balance: true } }),
        tx.account.findUnique({ where: { id: destination.id }, select: { balance: true } })
      ]);

      return { sourceAfter, destinationAfter };
    }, { isolationLevel: "Serializable" });

    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    return res.status(201).json({
      message: "Transfer completed",
      referenceId,
      sourceBalance: formatMinorUnits(result.sourceAfter.balance),
      destinationBalance: formatMinorUnits(result.destinationAfter.balance)
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message: "Concurrent account activity; retry the transfer"
      });
    }

    console.error("Transfer error:", error.message);
    return res.status(500).json({ message: "Unable to complete transfer" });
  }
});

module.exports = router;
