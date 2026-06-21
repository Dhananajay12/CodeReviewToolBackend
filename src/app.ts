import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import aiRoutes from "./routes/ai.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";
import { env } from "./config/env";

import prisma from "./config/db";

const app = express();

// Allow the React frontend (different origin) to send/receive the session
// cookie. `credentials: true` + an explicit origin are required for cookies.
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

// Liveness + DB connectivity check. Hit GET /health anytime.
app.get("/health", async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(503).json({
      status: "error",
      database: "disconnected",
      message: (err as Error).message,
    });
  }
});

app.use("/api/ai", aiRoutes);
app.use("/api/users", userRoutes);
app.use("/auth", authRoutes);

export default app;
