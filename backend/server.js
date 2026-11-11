const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to BalanceVault API",
    status: "running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "BalanceVault Backend"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`BalanceVault API running on port ${PORT}`);
});