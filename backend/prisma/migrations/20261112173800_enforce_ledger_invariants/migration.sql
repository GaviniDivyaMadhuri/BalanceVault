ALTER TABLE "Account"
ADD CONSTRAINT "Account_balance_nonnegative"
CHECK ("balance" >= 0);

CREATE INDEX "Account_userId_idx" ON "Account"("userId");

ALTER TABLE "LedgerEntry"
ADD CONSTRAINT "LedgerEntry_amount_positive"
CHECK ("amount" > 0);
