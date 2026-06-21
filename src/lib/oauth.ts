import { Google } from "arctic";
import { env } from "../config/env";

export const google = new Google(
	env.GOOGLE_CLIENT_ID,
	env.GOOGLE_CLIENT_SECRET,
	env.GOOGLE_REDIRECT_URI,
);

export const GOOGLE_SCOPES: string[] = ["openid", "profile", "email"];
