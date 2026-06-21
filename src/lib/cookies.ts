import type { Response, CookieOptions } from "express";
import { isProduction } from "../config/env";

export const SESSION_COOKIE_NAME = "session";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_VERIFIER_COOKIE = "google_code_verifier";
export const GITHUB_STATE_COOKIE = "github_oauth_state";
const OAUTH_FLOW_TTL_MS: number = 10 * 60 * 1000;

// sameSite "none"+secure in prod (cross-site cookies), "lax" in dev — deployment gotcha.
function baseCookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "none" : "lax",
		path: "/",
	};
}

export const setSessionCookie = (
	res: Response,
	token: string,
	expiresAt: Date,
): void => {
	res.cookie(SESSION_COOKIE_NAME, token, {
		...baseCookieOptions(),
		expires: expiresAt,
	});
};

export const clearSessionCookie = (res: Response): void => {
	res.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions());
};

export const setOAuthStateCookies = (
	res: Response,
	state: string,
	codeVerifier: string,
): void => {
	const options: CookieOptions = {
		...baseCookieOptions(),
		sameSite: "lax",
		maxAge: OAUTH_FLOW_TTL_MS,
	};
	res.cookie(GOOGLE_STATE_COOKIE, state, options);
	res.cookie(GOOGLE_VERIFIER_COOKIE, codeVerifier, options);
};

export const clearOAuthStateCookies = (res: Response): void => {
	const options: CookieOptions = { ...baseCookieOptions(), sameSite: "lax" };
	res.clearCookie(GOOGLE_STATE_COOKIE, options);
	res.clearCookie(GOOGLE_VERIFIER_COOKIE, options);
};

export const setGithubStateCookie = (res: Response, state: string): void => {
	res.cookie(GITHUB_STATE_COOKIE, state, {
		...baseCookieOptions(),
		sameSite: "lax",
		maxAge: OAUTH_FLOW_TTL_MS,
	});
};

export const clearGithubStateCookie = (res: Response): void => {
	res.clearCookie(GITHUB_STATE_COOKIE, { ...baseCookieOptions(), sameSite: "lax" });
};
