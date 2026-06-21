import type { Request, Response } from "express";
import { env } from "../config/env";
import { customResponse } from "../helpers/Response";
import { getAppSlug } from "../lib/github";
import {
	GITHUB_STATE_COOKIE,
	setGithubStateCookie,
	clearGithubStateCookie,
} from "../lib/cookies";
import {
	generateGithubState,
	exchangeCodeForUserToken,
	verifyInstallationOwnership,
	upsertGithubConnection,
	getConnectionsForUser,
	getReposForUser,
	getRepoForUser,
	listOpenPulls,
} from "../services/github.service";

// GET /github/connect — requireAuth. Start install + OAuth: stash a CSRF state
// cookie and redirect to the GitHub App's installation URL.
export const githubConnect = async (
	_req: Request,
	res: Response,
): Promise<void> => {
	const state = generateGithubState();
	setGithubStateCookie(res, state);

	const slug = await getAppSlug();
	const url = `https://github.com/apps/${slug}/installations/new?state=${state}`;
	res.redirect(url);
};

// GET /github/callback — requireAuth. GitHub returns code + installation_id + state.
export const githubCallback = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const code =
		typeof req.query.code === "string" ? req.query.code : undefined;
	const state =
		typeof req.query.state === "string" ? req.query.state : undefined;
	const installationIdRaw =
		typeof req.query.installation_id === "string"
			? req.query.installation_id
			: undefined;

	const storedState: string | undefined = req.cookies?.[GITHUB_STATE_COOKIE];

	if (
		!code ||
		!state ||
		!installationIdRaw ||
		!storedState ||
		state !== storedState
	) {
		clearGithubStateCookie(res);
		res.json(customResponse("Invalid GitHub state", false, 400, null));
		return;
	}

	clearGithubStateCookie(res);
	const installationId = Number(installationIdRaw);

	try {
		const userToken = await exchangeCodeForUserToken(code);
		if (!userToken) {
			res.json(customResponse("GitHub authorization failed", false, 400, null));
			return;
		}

		const ownership = await verifyInstallationOwnership(
			userToken,
			installationId,
		);
		if (!ownership) {
			res.json(
				customResponse(
					"This installation does not belong to your GitHub account",
					false,
					403,
					null,
				),
			);
			return;
		}

		await upsertGithubConnection({
			userId: req.userId as string,
			installationId,
			githubLogin: ownership.githubLogin,
			accountType: ownership.accountType,
		});

		res.redirect(`${env.FRONTEND_ORIGIN}/?github=connected`);
	} catch {
		res.json(customResponse("Failed to connect GitHub", false, 500, null));
	}
};

// GET /github/connection — requireAuth. The user's GitHub connection(s) +
// a link to manage repository access on GitHub.
export const githubConnections = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const connections = await getConnectionsForUser(req.userId as string);
	res.json(customResponse("Connections", true, 200, connections));
};

// GET /github/repos — requireAuth. List + sync the session user's repos.
export const githubRepos = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const repos = await getReposForUser(req.userId as string);

		if (repos === null) {
			res.json(customResponse("GitHub not connected", false, 400, null));
			return;
		}

		res.json(customResponse("Repositories", true, 200, repos));
	} catch {
		res.json(customResponse("Failed to list repositories", false, 500, null));
	}
};

// GET /github/repos/:repoId/pulls — requireAuth. Open PRs for a repo the user owns.
export const githubRepoPulls = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const repoId = String(req.params.repoId);
		const repo = await getRepoForUser(repoId, req.userId as string);

		// Not found OR not owned by this user → 404 (don't reveal existence).
		if (!repo) {
			res.json(customResponse("Repository not found", false, 404, null));
			return;
		}

		const pulls = await listOpenPulls(
			Number(repo.connection.installationId),
			repo.owner,
			repo.name,
		);

		res.json(customResponse("Open pull requests", true, 200, pulls));
	} catch {
		res.json(customResponse("Failed to list pull requests", false, 500, null));
	}
};
