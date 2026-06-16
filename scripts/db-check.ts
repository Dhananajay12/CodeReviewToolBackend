import "dotenv/config";
import prisma from "../src/config/db";

// Proves the Prisma + Neon connection works end to end:
// insert one user -> read it back -> delete the row.
async function main() {
	const email = `db-check-${Date.now()}@example.com`;

	console.log("→ Inserting user:", email);
	const created = await prisma.user.create({
		data: { email, passwordHash: "test-hash" },
	});
	console.log("  inserted id:", created.id);

	console.log("→ Reading it back…");
	const found = await prisma.user.findUnique({ where: { id: created.id } });
	if (!found) throw new Error("Read-back failed: user not found");
	console.log("  read back:", found.email);

	console.log("→ Deleting the row…");
	await prisma.user.delete({ where: { id: created.id } });

	const afterDelete = await prisma.user.findUnique({
		where: { id: created.id },
	});
	if (afterDelete) throw new Error("Delete failed: user still present");
	console.log("  confirmed deleted (row is gone)");
}

main()
	.then(() => console.log("\n✅ DB round-trip succeeded"))
	.catch((err) => {
		console.error("\n❌ DB round-trip failed:", err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
