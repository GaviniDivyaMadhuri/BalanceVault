-- Link related ledger entries to the same financial operation.
ALTER TABLE "LedgerEntry" ADD COLUMN "referenceId" TEXT;

CREATE INDEX "LedgerEntry_accountId_createdAt_idx"
ON "LedgerEntry"("accountId", "createdAt");

CREATE INDEX "LedgerEntry_referenceId_idx"
ON "LedgerEntry"("referenceId");
