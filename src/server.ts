import "dotenv/config";
import app from "./app";
import prisma from "./config/db";

app.listen(3000, async () => {
	console.log("Server is running on http://localhost:3000");

	// Verify database connectivity at startup (read-only — no schema changes).
	try {
		await prisma.$queryRaw`SELECT 1`;
		console.log("✅ Database connected");
	} catch (err) {
		console.error("❌ Database connection failed:", (err as Error).message);
	}
});
