import "dotenv/config";
import app from "./app";
import prisma from "./config/db";
import { env } from "./config/env";

app.listen(env.NODE_PORT, async () => {
	console.log(`Server is running on http://localhost:${env.NODE_PORT}`);

	// Verify database connectivity at startup (read-only — no schema changes).
	try {
		await prisma.$queryRaw`SELECT 1`;
		console.log("✅ Database connected");
	} catch (err) {
		console.error("❌ Database connection failed:", (err as Error).message);
	}
});
