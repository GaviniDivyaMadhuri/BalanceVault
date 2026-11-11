
const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication token is required"
    });
  }

  if (!process.env.JWT_SECRET) {
    return next(new Error("JWT_SECRET is not configured"));
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice("Bearer ".length), process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Invalid or expired authentication token"
      });
    }

    return next(error);
  }

  if (typeof decoded.sub !== "string") {
    return res.status(401).json({
      message: "Invalid or expired authentication token"
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true
      }
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(403).json({
        message: "Account is inactive or unavailable"
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({
      message: "Administrator access required"
    });
  }

  next();
}

function accountHolderOnly(req, res, next) {
  if (!req.user || req.user.role !== "ACCOUNT_HOLDER") {
    return res.status(403).json({
      message: "Account-holder access required"
    });
  }

  next();
}

module.exports = { accountHolderOnly, authenticate, adminOnly };
