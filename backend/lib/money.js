const MAX_AMOUNT_MINOR = 10000000000000000n;

function parseAmountToMinorUnits(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw new TypeError("Amount must be a positive decimal with at most two places");
  }

  const [whole, fraction = ""] = value.split(".");
  if (whole.length > 15) {
    throw new RangeError("Amount is outside the supported range");
  }

  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  if (amount === 0n || amount > MAX_AMOUNT_MINOR) {
    throw new RangeError("Amount is outside the supported range");
  }

  return amount;
}

function formatMinorUnits(value) {
  const amount = BigInt(value);
  const whole = amount / 100n;
  const fraction = String(amount % 100n).padStart(2, "0");

  return `${whole}.${fraction}`;
}

module.exports = { formatMinorUnits, parseAmountToMinorUnits };
