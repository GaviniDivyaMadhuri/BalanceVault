
const express = require("express");
const prisma = require("../prismaClient");
const { randomUUID } = require("node:crypto");
const { authenticate, adminOnly } = require("../middleware/authMiddleware");
const { generateAccountNumber } = require("../lib/accounts");
const { formatMinorUnits, parseAmountToMinorUnits } = require("../lib/money");

const router = express.Router();

// Protect every admin endpoint
router.use(authenticate, adminOnly);

// 1. View all registered users
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "ACCOUNT_HOLDER" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.status(200).json({ users });
  } catch (error) {
    console.error("Fetch users error:", error.message);
    res.status(500).json({ message: "Unable to fetch users" });
  }
});

// 2. Approve a pending account holder
router.patch("/users/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id }
      });

      if (!user || user.role !== "ACCOUNT_HOLDER") {
        return { error: "Account holder not found", status: 404 };
      }

      if (user.status !== "PENDING") {
        return { error: "Only pending users can be approved", status: 409 };
      }

      const updatedUser = await tx.user.update({
        where: { id },
        data: { status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true
        }
      });

      const account = await tx.account.create({
        data: {
          accountNo: generateAccountNumber(),
          userId: id
        },
        select: {
          id: true,
          accountNo: true,
          status: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "USER_APPROVED",
          details: { targetUserId: id, accountId: account.id }
        }
      });

      return { user: updatedUser, account };
    });

    if (result.error) {
      return res.status(result.status).json({
        message: result.error
      });
    }

    res.status(200).json({
      message: "Account holder approved successfully",
      user: result.user,
      account: result.account
    });
  } catch (error) {
    console.error("Approval error:", error.message);
    res.status(500).json({ message: "Unable to approve user" });
  }
});

// 3. Suspend an active account holder
router.patch("/users/:id/suspend", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id }
      });

      if (!user || user.role !== "ACCOUNT_HOLDER") {
        return { error: "Account holder not found", status: 404 };
      }

      if (user.status !== "ACTIVE") {
        return { error: "Only active users can be suspended", status: 409 };
      }

      const updatedUser = await tx.user.update({
        where: { id },
        data: { status: "SUSPENDED" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "USER_SUSPENDED",
          details: { targetUserId: id }
        }
      });

      return { user: updatedUser };
    });

    if (result.error) {
      return res.status(result.status).json({
        message: result.error
      });
    }

    res.status(200).json({
      message: "Account holder suspended successfully",
      user: result.user
    });
  } catch (error) {
    console.error("Suspension error:", error.message);
    res.status(500).json({ message: "Unable to suspend user" });
  }
});

router.get("/accounts", async (_req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        accountNo: true,
        balance: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      accounts: accounts.map((account) => ({
        ...account,
        balance: formatMinorUnits(account.balance)
      }))
    });
  } catch (error) {
    console.error("Fetch accounts error:", error.message);
    return res.status(500).json({ message: "Unable to fetch accounts" });
  }
});

router.post("/accounts/:id/adjustments", async (req, res) => {
  const { type, amount, description } = req.body;

  if (
    !["CREDIT", "DEBIT"].includes(type) ||
    typeof description !== "string" ||
    !description.trim() ||
    description.trim().length > 160
  ) {
    return res.status(400).json({ message: "Invalid adjustment details" });
  }

  let amountMinor;
  try {
    amountMinor = parseAmountToMinorUnits(amount);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const referenceId = randomUUID();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true }
      });

      if (!account) {
        return { error: "Account not found", status: 404 };
      }

      if (account.status !== "ACTIVE") {
        return { error: "Account is not active", status: 409 };
      }

      const update = await tx.account.updateMany({
        where: {
          id: account.id,
          status: "ACTIVE",
          ...(type === "DEBIT" ? { balance: { gte: amountMinor } } : {})
        },
        data: {
          balance: type === "CREDIT"
            ? { increment: amountMinor }
            : { decrement: amountMinor }
        }
      });

      if (update.count !== 1) {
        return { error: "Insufficient funds or account unavailable", status: 409 };
      }

      await tx.ledgerEntry.create({
        data: {
          accountId: account.id,
          type,
          amount: amountMinor,
          description: description.trim(),
          referenceId
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: type === "CREDIT" ? "ACCOUNT_CREDITED" : "ACCOUNT_DEBITED",
          details: {
            accountId: account.id,
            referenceId,
            amount: amountMinor.toString(),
            description: description.trim()
          }
        }
      });

      const updatedAccount = await tx.account.findUnique({
        where: { id: account.id },
        select: { balance: true }
      });

      return { balance: updatedAccount.balance };
    }, { isolationLevel: "Serializable" });

    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    return res.status(201).json({
      message: `Account ${type.toLowerCase()} recorded`,
      referenceId,
      balance: formatMinorUnits(result.balance)
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message: "Concurrent account activity; retry the adjustment"
      });
    }

    console.error("Account adjustment error:", error.message);
    return res.status(500).json({ message: "Unable to record account adjustment" });
  }
});

// View audit logs
router.get("/audit-logs", async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    res.status(200).json({ logs });
  } catch (error) {
    console.error("Audit log error:", error.message);
    res.status(500).json({ message: "Unable to fetch audit logs" });
  }
});

module.exports = router;
