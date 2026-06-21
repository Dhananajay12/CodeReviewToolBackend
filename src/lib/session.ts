import { randomBytes } from "node:crypto";
import prisma from "../config/db";

const SESSION_TTL_MS: number = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
	id: string;
	email: string;
}

export interface CreatedSession {
	token: string;
	expiresAt: Date;
}

export const generateSessionToken = (): string => {
	return randomBytes(32).toString("hex");
};

export const createSession = async (
	userId: string,
): Promise<CreatedSession> => {
	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	await prisma.session.create({
		data: { id: token, userId, expiresAt },
	});

	return { token, expiresAt };
};

export const deleteSession = async (token: string): Promise<void> => {
	await prisma.session.deleteMany({ where: { id: token } });
};

export const validateSessionToken = async (
	token: string,
): Promise<SessionUser | null> => {
	if (!token) return null;

	const session = await prisma.session.findUnique({
		where: { id: token },
		include: { user: { select: { id: true, email: true } } },
	});

	if (!session) return null;

	if (session.expiresAt.getTime() <= Date.now()) {
		await deleteSession(token);
		return null;
	}

	return session.user;
};
