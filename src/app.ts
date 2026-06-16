import express, { Request, Response } from "express";
import cors from "cors";
import aiRoutes from "./routes/ai.routes";
import userRoutes from "./routes/user.routes";

import prisma from "./config/db";

const app = express();

app.use(cors());

app.use(express.json());

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

export default app;
