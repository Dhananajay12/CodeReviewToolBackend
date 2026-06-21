import type { Request, Response } from "express";
import { generateState, generateCodeVerifier, decodeIdToken } from "arctic";
import prisma from "../config/db";
import { env } from "../config/env";
import { customResponse } from "../helpers/Response";
import {
	registerSchema,
	loginSchema,
	updateProfileSchema,
	changePasswordSchema,
} from "../schemas/auth.schema";
import {
	registerUser,
	loginUser,
	findOrCreateGoogleUser,
	updateProfile,
	changePassword,
} from "../services/auth.service";
import { createSession, deleteSession } from "../lib/session";
import { google, GOOGLE_SCOPES } from "../lib/oauth";
import {
	SESSION_COOKIE_NAME,
	GOOGLE_STATE_COOKIE,
	GOOGLE_VERIFIER_COOKIE,
	setSessionCookie,
	clearSessionCookie,
	setOAuthStateCookies,
	clearOAuthStateCookies,
} from "../lib/cookies";

interface GoogleIdTokenClaims {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
}

export const register = async (req: Request, res: Response): Promise<void> => {
	const response = registerSchema.safeParse(req.body);

	if (!response.success) {
		res.json(customResponse("Invalid input", false, 400, null));
		return;
	}

	const { email, password } = response.data;
	const result = await registerUser(email, password);

	if (!result.ok) {
		res.json(customResponse("Email already in use", false, 409, null));
		return;
	}

	setSessionCookie(res, result.session.token, result.session.expiresAt);
	res.json(customResponse("Registered successfully", true, 201, result.user));
};

export const login = async (req: Request, res: Response): Promise<void> => {
	const response = loginSchema.safeParse(req.body);

	if (!response.success) {
		res.json(customResponse("Invalid input", false, 400, null));
		return;
	}

	const { email, password } = response.data;
	const result = await loginUser(email, password);

	if (!result.ok) {
		res.json(customResponse("Invalid email or password", false, 401, null));
		return;
	}

	setSessionCookie(res, result.session.token, result.session.expiresAt);
	res.json(customResponse("Logged in successfully", true, 200, result.user));
};

export const logout = async (req: Request, res: Response): Promise<void> => {
	const token: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];

	if (token) {
		await deleteSession(token);
	}

	clearSessionCookie(res);
	res.json(customResponse("Logged out", true, 200, null));
};

export const me = async (req: Request, res: Response): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { id: req.userId },
		select: { id: true, email: true, name: true, passwordHash: true },
	});

	if (!user) {
		res.json(customResponse("Unauthorized", false, 401, null));
		return;
	}

	const { passwordHash, ...safe } = user;
	res.json(
		customResponse("Current user", true, 200, {
			...safe,
			hasPassword: passwordHash !== null,
		}),
	);
};

export const updateMe = async (req: Request, res: Response): Promise<void> => {
	const parsed = updateProfileSchema.safeParse(req.body);

	if (!parsed.success) {
		res.json(customResponse("Invalid input", false, 400, null));
		return;
	}

	const user = await updateProfile(req.userId as string, parsed.data.name);
	res.json(customResponse("Profile updated", true, 200, user));
};

export const changePasswordHandler = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const parsed = changePasswordSchema.safeParse(req.body);

	if (!parsed.success) {
		res.json(customResponse("Invalid input", false, 400, null));
		return;
	}

	const result = await changePassword(
		req.userId as string,
		parsed.data.currentPassword,
		parsed.data.newPassword,
	);

	if (!result.ok) {
		if (result.reason === "NO_PASSWORD") {
			res.json(
				customResponse("This account has no password set", false, 400, null),
			);
			return;
		}
		res.json(customResponse("Current password is incorrect", false, 400, null));
		return;
	}

	res.json(customResponse("Password changed", true, 200, null));
};

export const googleAuth = async (
	_req: Request,
	res: Response,
): Promise<void> => {
	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	const url = google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);

	setOAuthStateCookies(res, state, codeVerifier);
	res.redirect(url.toString());
};

export const googleCallback = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const code =
		typeof req.query.code === "string" ? req.query.code : undefined;
	const state =
		typeof req.query.state === "string" ? req.query.state : undefined;

	const storedState: string | undefined = req.cookies?.[GOOGLE_STATE_COOKIE];
	const codeVerifier: string | undefined =
		req.cookies?.[GOOGLE_VERIFIER_COOKIE];

	if (
		!code ||
		!state ||
		!storedState ||
		!codeVerifier ||
		state !== storedState
	) {
		clearOAuthStateCookies(res);
		res.json(customResponse("Invalid OAuth state", false, 400, null));
		return;
	}

	try {
		const tokens = await google.validateAuthorizationCode(code, codeVerifier);
		const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;

		const user = await findOrCreateGoogleUser({
			googleSub: claims.sub,
			email: claims.email,
			emailVerified: claims.email_verified,
			name: claims.name ?? null,
		});

		const session = await createSession(user.id);

		clearOAuthStateCookies(res);
		setSessionCookie(res, session.token, session.expiresAt);

		res.redirect(env.FRONTEND_ORIGIN);
	} catch {
		clearOAuthStateCookies(res);
		res.json(customResponse("Google authentication failed", false, 400, null));
	}
};
