const { randomInt } = require("node:crypto");

function generateAccountNumber() {
  return String(randomInt(10000000000000, 99999999999999));
}

module.exports = { generateAccountNumber };
