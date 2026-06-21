import "dotenv/config";
import prisma from "../src/config/db";

async function main() {
	const rows = await prisma.githubConnection.findMany({
		orderBy: { connectedAt: "desc" },
		include: { user: { select: { email: true } } },
	});

	if (rows.length === 0) {
		console.log("No github_connections rows yet.");
		return;
	}

	for (const r of rows) {
		console.log({
			id: r.id,
			appUser: r.user.email,
			userId: r.userId,
			installationId: r.installationId.toString(),
			githubLogin: r.githubLogin,
			accountType: r.accountType,
			connectedAt: r.connectedAt.toISOString(),
		});
	}
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
