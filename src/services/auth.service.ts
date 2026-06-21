import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { hashPassword, verifyPassword } from "../lib/password";
import { createSession, type CreatedSession } from "../lib/session";

// Only ever expose these user fields to the client.
export interface SafeUser {
	id: string;
	email: string;
	name: string | null;
}

const safeUserSelect = { id: true, email: true, name: true } as const;

export type RegisterResult =
	| { ok: true; user: SafeUser; session: CreatedSession }
	| { ok: false; reason: "EMAIL_TAKEN" };

export type LoginResult =
	| { ok: true; user: SafeUser; session: CreatedSession }
	| { ok: false; reason: "INVALID_CREDENTIALS" };

/**
 * Register a new user: hash the password, create the user + a session.
 * Duplicate emails are reported as EMAIL_TAKEN (caught via the unique
 * constraint, so it's race-safe — no check-then-insert gap).
 */
export const registerUser = async (
	email: string,
	password: string,
): Promise<RegisterResult> => {
	const passwordHash = await hashPassword(password);

	try {
		const user = await prisma.user.create({
			data: { email, passwordHash },
			select: safeUserSelect,
		});

		const session = await createSession(user.id);
		return { ok: true, user, session };
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === "P2002"
		) {
			return { ok: false, reason: "EMAIL_TAKEN" };
		}
		throw err;
	}
};

/**
 * Authenticate by email + password. Returns the SAME INVALID_CREDENTIALS
 * result whether the user is missing or the password is wrong, so callers
 * cannot distinguish the two (prevents user enumeration).
 */
export const loginUser = async (
	email: string,
	password: string,
): Promise<LoginResult> => {
	const user = await prisma.user.findUnique({ where: { email } });

	// No user, or an OAuth-only user with no password set — same generic result.
	if (!user || !user.passwordHash) {
		return { ok: false, reason: "INVALID_CREDENTIALS" };
	}

	const passwordValid = await verifyPassword(user.passwordHash, password);

	if (!passwordValid) {
		return { ok: false, reason: "INVALID_CREDENTIALS" };
	}

	const session = await createSession(user.id);
	return {
		ok: true,
		user: { id: user.id, email: user.email, name: user.name },
		session,
	};
};

const GOOGLE_PROVIDER = "google";

export interface GoogleProfile {
	googleSub: string; // Google's stable user id ("sub")
	email: string;
	emailVerified: boolean;
	name?: string | null;
}

/**
 * Resolve a Google profile to a local user, creating/linking as needed:
 *  1. If an account row exists for (google, sub) → use its user.
 *  2. Else if the email is verified and matches an existing user → link by
 *     adding an account row (so password + Google share one user).
 *  3. Else create a new user (no password) + the account row.
 *
 * Auto-linking only happens when Google reports the email as verified, to
 * prevent account takeover via an unverified address.
 */
export const findOrCreateGoogleUser = async (
	profile: GoogleProfile,
): Promise<SafeUser> => {
	const { googleSub, email, emailVerified, name } = profile;

	// 1. Returning Google user — account already linked.
	const existingAccount = await prisma.account.findUnique({
		where: {
			provider_providerAccountId: {
				provider: GOOGLE_PROVIDER,
				providerAccountId: googleSub,
			},
		},
		include: { user: { select: safeUserSelect } },
	});

	if (existingAccount) {
		return existingAccount.user;
	}

	// 2. Same (verified) email already registered — link Google to that user.
	if (emailVerified) {
		const existingUser = await prisma.user.findUnique({
			where: { email },
			select: safeUserSelect,
		});

		if (existingUser) {
			await prisma.account.create({
				data: {
					userId: existingUser.id,
					provider: GOOGLE_PROVIDER,
					providerAccountId: googleSub,
				},
			});
			return existingUser;
		}
	}

	// 3. Brand-new user (OAuth-only — passwordHash stays null) + account row.
	const user = await prisma.user.create({
		data: {
			email,
			name: name ?? null,
			accounts: {
				create: {
					provider: GOOGLE_PROVIDER,
					providerAccountId: googleSub,
				},
			},
		},
		select: safeUserSelect,
	});

	return user;
};

/** Update the current user's editable profile fields (display name). */
export const updateProfile = async (
	userId: string,
	name: string,
): Promise<SafeUser> => {
	return prisma.user.update({
		where: { id: userId },
		data: { name },
		select: safeUserSelect,
	});
};

export type ChangePasswordResult =
	| { ok: true }
	| { ok: false; reason: "NO_PASSWORD" | "INVALID_PASSWORD" };

/**
 * Change the current user's password after verifying the current one.
 * NO_PASSWORD is returned for OAuth-only accounts that never set a password.
 */
export const changePassword = async (
	userId: string,
	currentPassword: string,
	newPassword: string,
): Promise<ChangePasswordResult> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { passwordHash: true },
	});

	if (!user || !user.passwordHash) {
		return { ok: false, reason: "NO_PASSWORD" };
	}

	const currentValid = await verifyPassword(user.passwordHash, currentPassword);
	if (!currentValid) {
		return { ok: false, reason: "INVALID_PASSWORD" };
	}

	const passwordHash = await hashPassword(newPassword);
	await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

	return { ok: true };
};
