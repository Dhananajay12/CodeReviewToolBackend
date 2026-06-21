import { Octokit } from "@octokit/core";
import { createAppAuth } from "@octokit/auth-app";
import { env } from "../config/env";

const appAuth = {
	appId: env.GITHUB_APP_ID,
	privateKey: env.GITHUB_APP_PRIVATE_KEY,
};

// App-level client (authenticates as the GitHub App via a JWT). Used to read
// app metadata such as the slug needed to build the install URL.
const appOctokit = new Octokit({ authStrategy: createAppAuth, auth: appAuth });

let cachedSlug: string | null = null;

export const getAppSlug = async (): Promise<string> => {
	if (cachedSlug) return cachedSlug;
	const { data } = await appOctokit.request("GET /app");
	cachedSlug = data?.slug ?? "";
	return cachedSlug;
};

// Installation-scoped client: @octokit/auth-app mints (and caches) the
// short-lived installation access token automatically for each request.
export const getInstallationOctokit = (installationId: number): Octokit => {
	return new Octokit({
		authStrategy: createAppAuth,
		auth: { ...appAuth, installationId },
	});
};

// Client authenticated as a GitHub user with a user-to-server access token.
export const getUserOctokit = (userToken: string): Octokit => {
	return new Octokit({ auth: userToken });
};
