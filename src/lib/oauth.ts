import { Google } from "arctic";
import { env } from "../config/env";

// Single configured Google OAuth client (arctic). The redirect URI must exactly
// match one registered in the Google Cloud console for this client.
export const google = new Google(
	env.GOOGLE_CLIENT_ID,
	env.GOOGLE_CLIENT_SECRET,
	env.GOOGLE_REDIRECT_URI,
);

// Scopes: OpenID Connect identity + the user's email.
export const GOOGLE_SCOPES: string[] = ["openid", "profile", "email"];
