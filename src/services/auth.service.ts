import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { hashPassword, verifyPassword } from "../lib/password";
import { createSession, type CreatedSession } from "../lib/session";

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

// Returns the same INVALID_CREDENTIALS for missing-user vs wrong-password to prevent user enumeration.
export const loginUser = async (
	email: string,
	password: string,
): Promise<LoginResult> => {
	const user = await prisma.user.findUnique({ where: { email } });

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
		user: { id: user.id, email: user.email, name: user?.name },
		session,
	};
};

const GOOGLE_PROVIDER = "google";

export interface GoogleProfile {
	googleSub: string;
	email: string;
	emailVerified: boolean;
	name?: string | null;
}

// Auto-linking only happens when the email is verified, to prevent account takeover.
export const findOrCreateGoogleUser = async (
	profile: GoogleProfile,
): Promise<SafeUser> => {
	const { googleSub, email, emailVerified, name } = profile;

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
