import "dotenv/config";
import prisma from "../src/config/db";
import { findOrCreateGoogleUser } from "../src/services/auth.service";
import { createSession } from "../src/lib/session";
import { hashPassword } from "../src/lib/password";

// Exercises the exact logic the Google callback runs after a successful token
// exchange — without needing real Google credentials / a browser.
async function main() {
	const ts = Date.now();

	// ---- Case A: brand-new Google user (no prior account, verified email) ----
	const newEmail = `gnew-${ts}@example.com`;
	const subA = `sub-new-${ts}`;
	const a1 = await findOrCreateGoogleUser({
		googleSub: subA,
		email: newEmail,
		emailVerified: true,
	});
	console.log("A) new google user:", a1);

	// ---- Idempotency: same Google sub again must reuse the same user ----
	const a2 = await findOrCreateGoogleUser({
		googleSub: subA,
		email: newEmail,
		emailVerified: true,
	});
	console.log("   second sign-in same user? ", a1.id === a2.id);

	const dbA = await prisma.user.findUnique({
		where: { id: a1.id },
		include: { accounts: true },
	});
	console.log("   passwordHash is null?      ", dbA?.passwordHash === null);
	console.log("   accounts count (expect 1): ", dbA?.accounts.length);
	console.log(
		"   account (provider, sub):   ",
		dbA?.accounts[0]?.provider,
		dbA?.accounts[0]?.providerAccountId,
	);

	// ---- Case B: link Google to an EXISTING password user (verified email) ----
	const linkEmail = `glink-${ts}@example.com`;
	const passwordUser = await prisma.user.create({
		data: { email: linkEmail, passwordHash: await hashPassword("supersecret123") },
		select: { id: true },
	});
	const b = await findOrCreateGoogleUser({
		googleSub: `sub-link-${ts}`,
		email: linkEmail,
		emailVerified: true,
	});
	console.log("B) linked to existing password user?", b.id === passwordUser.id);
	const dbB = await prisma.user.findUnique({
		where: { id: passwordUser.id },
		include: { accounts: true },
	});
	console.log(
		"   has BOTH password + google account?",
		dbB?.passwordHash !== null && dbB?.accounts.length === 1,
	);

	// ---- Create a session for the new Google user so we can hit /auth/me ----
	const session = await createSession(a1.id);
	console.log("ME_USER_ID=" + a1.id);
	console.log("SESSION_TOKEN=" + session.token);

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error("FAIL", err);
	process.exit(1);
});
