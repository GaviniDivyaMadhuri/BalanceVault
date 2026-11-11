process.env.JWT_SECRET = "test-jwt-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../server");
const prisma = require("../prismaClient");

async function withServer(run) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tokenFor(userId = "account-holder-id") {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: userId,
    expiresIn: "5m"
  });
}

function stubMethod(t, target, methodName, implementation) {
  const original = target[methodName];
  target[methodName] = implementation;
  t.after(() => {
    target[methodName] = original;
  });
}

test("health endpoint remains public", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "healthy",
      service: "BalanceVault Backend"
    });
  });
});

test("unknown API routes return a JSON 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: "Route not found" });
  });
});

test("account endpoints reject requests without a bearer token", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/accounts`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, "Authentication token is required");
  });
});

test("malformed bearer token is rejected before database access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/accounts`, {
      headers: { Authorization: "Bearer not-a-signed-token" }
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, "Invalid or expired authentication token");
  });
});

test("authentication routes enforce the attempt limit", async () => {
  await withServer(async (baseUrl) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 400);
    }

    const limitedResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(limitedResponse.status, 429);
  });
});

test("account holders cannot access admin endpoints", async (t) => {
  stubMethod(t, prisma.user, "findUnique", async () => ({
    id: "account-holder-id",
    name: "Account Holder",
    email: "holder@example.com",
    role: "ACCOUNT_HOLDER",
    status: "ACTIVE"
  }));

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${tokenFor()}` }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).message, "Administrator access required");
  });
});

test("account holders cannot read another user's ledger", async (t) => {
  stubMethod(t, prisma.user, "findUnique", async () => ({
    id: "account-holder-id",
    name: "Account Holder",
    email: "holder@example.com",
    role: "ACCOUNT_HOLDER",
    status: "ACTIVE"
  }));
  let ledgerQueryCount = 0;
  stubMethod(t, prisma.ledgerEntry, "findMany", async () => {
    ledgerQueryCount += 1;
    return [];
  });
  stubMethod(t, prisma.account, "findFirst", async () => null);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/accounts/another-users-account/ledger`, {
      headers: { Authorization: `Bearer ${tokenFor()}` }
    });
    assert.equal(response.status, 404);
    assert.equal(ledgerQueryCount, 0);
  });
});

test("a transfer cannot write ledger entries when the source has insufficient funds", async (t) => {
  stubMethod(t, prisma.user, "findUnique", async () => ({
    id: "account-holder-id",
    name: "Account Holder",
    email: "holder@example.com",
    role: "ACCOUNT_HOLDER",
    status: "ACTIVE"
  }));

  const tx = {
    account: {
      findFirst: async () => ({ id: "source-id", status: "ACTIVE" }),
      findUnique: async () => ({
        id: "destination-id",
        accountNo: "12345678901234",
        status: "ACTIVE",
        user: { status: "ACTIVE" }
      }),
      updateMany: async () => ({ count: 0 })
    },
    ledgerEntry: {
      createMany: async () => {
        throw new Error("Ledger should not be written for a rejected transfer");
      }
    },
    auditLog: {
      create: async () => {
        throw new Error("Audit success event should not be written for a rejected transfer");
      }
    }
  };
  stubMethod(t, prisma, "$transaction", async (callback) => callback(tx));

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/accounts/source-id/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenFor()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destinationAccountNo: "12345678901234",
        amount: "20.00"
      })
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /Insufficient funds/);
  });
});

test("a transfer cannot send funds to a suspended account holder", async (t) => {
  stubMethod(t, prisma.user, "findUnique", async () => ({
    id: "account-holder-id",
    name: "Account Holder",
    email: "holder@example.com",
    role: "ACCOUNT_HOLDER",
    status: "ACTIVE"
  }));

  let debitCalls = 0;
  const tx = {
    account: {
      findFirst: async () => ({ id: "source-id", status: "ACTIVE" }),
      findUnique: async () => ({
        id: "destination-id",
        accountNo: "12345678901234",
        status: "ACTIVE",
        user: { status: "SUSPENDED" }
      }),
      updateMany: async () => {
        debitCalls += 1;
        return { count: 1 };
      }
    },
    ledgerEntry: {
      createMany: async () => {
        throw new Error("Ledger should not be written to a suspended account holder");
      }
    },
    auditLog: {
      create: async () => {
        throw new Error("A rejected transfer should not record a success audit event");
      }
    }
  };
  stubMethod(t, prisma, "$transaction", async (callback) => callback(tx));

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/accounts/source-id/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenFor()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destinationAccountNo: "12345678901234",
        amount: "20.00"
      })
    });

    assert.equal(response.status, 404);
    assert.equal(debitCalls, 0);
  });
});

test("a transfer records matching ledger entries and an audit event atomically", async (t) => {
  stubMethod(t, prisma.user, "findUnique", async () => ({
    id: "account-holder-id",
    name: "Account Holder",
    email: "holder@example.com",
    role: "ACCOUNT_HOLDER",
    status: "ACTIVE"
  }));

  const transferRecords = {
    updates: [],
    entries: [],
    audit: []
  };
  let balanceLookup = 0;
  const tx = {
    account: {
      findFirst: async (args) => {
        assert.deepEqual(args.where, {
          id: "source-id",
          userId: "account-holder-id"
        });
        return { id: "source-id", status: "ACTIVE" };
      },
      findUnique: async (args) => {
        if (args.where.accountNo) {
          return {
            id: "destination-id",
            accountNo: "12345678901234",
            status: "ACTIVE",
            user: { status: "ACTIVE" }
          };
        }

        balanceLookup += 1;
        return { balance: balanceLookup === 1 ? 8766n : 1234n };
      },
      updateMany: async (args) => {
        transferRecords.updates.push(args);
        return { count: 1 };
      }
    },
    ledgerEntry: {
      createMany: async ({ data }) => {
        transferRecords.entries.push(...data);
      }
    },
    auditLog: {
      create: async ({ data }) => {
        transferRecords.audit.push(data);
      }
    }
  };
  stubMethod(t, prisma, "$transaction", async (callback, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    return callback(tx);
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/accounts/source-id/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenFor()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destinationAccountNo: "12345678901234",
        amount: "12.34",
        description: "Test transfer"
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.sourceBalance, "87.66");
    assert.equal(body.destinationBalance, "12.34");
    assert.equal(transferRecords.updates.length, 2);
    assert.equal(transferRecords.updates[0].data.balance.decrement, 1234n);
    assert.equal(transferRecords.updates[1].data.balance.increment, 1234n);
    assert.equal(transferRecords.entries.length, 2);
    assert.deepEqual(
      transferRecords.entries.map((entry) => [entry.accountId, entry.type, entry.amount]),
      [
        ["source-id", "DEBIT", 1234n],
        ["destination-id", "CREDIT", 1234n]
      ]
    );
    assert.equal(transferRecords.entries[0].referenceId, body.referenceId);
    assert.equal(transferRecords.entries[1].referenceId, body.referenceId);
    assert.equal(transferRecords.audit[0].action, "TRANSFER_COMPLETED");
    assert.equal(transferRecords.audit[0].details.amount, "1234");
  });
});
