const test = require("node:test");
const assert = require("node:assert/strict");
const { formatMinorUnits, parseAmountToMinorUnits } = require("../lib/money");

test("parses decimal amounts into exact minor units", () => {
  assert.equal(parseAmountToMinorUnits("0.01"), 1n);
  assert.equal(parseAmountToMinorUnits("1234.5"), 123450n);
  assert.equal(formatMinorUnits(123450n), "1234.50");
});

test("rejects amounts that could be ambiguous or invalid", () => {
  for (const amount of ["-1", "1.001", "01.00", "1e2", " 1.00"]) {
    assert.throws(() => parseAmountToMinorUnits(amount), TypeError, amount);
  }

  for (const amount of ["0", "0.00"]) {
    assert.throws(() => parseAmountToMinorUnits(amount), RangeError, amount);
  }

  assert.throws(() => parseAmountToMinorUnits(1), TypeError);
});
