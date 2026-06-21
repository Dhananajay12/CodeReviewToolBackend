import type { Response, CookieOptions } from "express";
import { isProduction } from "../config/env";

export const SESSION_COOKIE_NAME = "session";

// Short-lived cookies that carry OAuth state + PKCE verifier across the
// redirect to Google and back. 10 minutes is plenty for a sign-in.
export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_VERIFIER_COOKIE = "google_code_verifier";
const OAUTH_FLOW_TTL_MS: number = 10 * 60 * 1000;

// Shared cookie attributes.
// - httpOnly: not readable from JS (mitigates XSS token theft)
// - secure: HTTPS-only in production
// - sameSite: "none" cross-site in prod (requires secure), "lax" in dev
function baseCookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "none" : "lax",
		path: "/",
	};
}

/** Set the session cookie with an expiry matching the session row. */
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

/** Clear the session cookie (same attributes so the browser matches it). */
export const clearSessionCookie = (res: Response): void => {
	res.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions());
};

/**
 * Store the OAuth `state` and PKCE `codeVerifier` in short-lived httpOnly
 * cookies so the callback can verify them. SameSite=lax so they survive the
 * top-level redirect back from Google.
 */
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

/** Clear the OAuth flow cookies once the callback has consumed them. */
export const clearOAuthStateCookies = (res: Response): void => {
	const options: CookieOptions = { ...baseCookieOptions(), sameSite: "lax" };
	res.clearCookie(GOOGLE_STATE_COOKIE, options);
	res.clearCookie(GOOGLE_VERIFIER_COOKIE, options);
};
