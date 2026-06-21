import { randomBytes } from "node:crypto";
import prisma from "../config/db";
import { env } from "../config/env";
import { getUserOctokit, getInstallationOctokit } from "../lib/github";

export const generateGithubState = (): string => {
	return randomBytes(32).toString("hex");
};

interface GithubTokenResponse {
	access_token?: string;
	error?: string;
}

// Exchange the OAuth `code` for a user-to-server access token.
export const exchangeCodeForUserToken = async (
	code: string,
): Promise<string | null> => {
	const res = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: env.GITHUB_CLIENT_ID,
			client_secret: env.GITHUB_CLIENT_SECRET,
			code,
		}),
	});

	const data = (await res.json()) as GithubTokenResponse;
	return data.access_token ?? null;
};

export interface VerifiedInstallation {
	githubLogin: string;
	installationId: number;
	accountType: string;
}

// Confirm the installationId actually belongs to the authenticated user before
// we ever store it — prevents binding someone else's installation to our user.
export const verifyInstallationOwnership = async (
	userToken: string,
	installationId: number,
): Promise<VerifiedInstallation | null> => {
	const octokit = getUserOctokit(userToken);

	const { data: githubUser } = await octokit.request("GET /user");
	const { data } = await octokit.request("GET /user/installations", {
		per_page: 100,
	});

	const match = data.installations.find((i) => i.id === installationId);
	if (!match) return null;

	const account = match.account as { type?: string } | null;

	return {
		githubLogin: githubUser.login,
		installationId,
		accountType: account?.type ?? "User",
	};
};

export const upsertGithubConnection = async (params: {
	userId: string;
	installationId: number;
	githubLogin: string;
	accountType: string;
}) => {
	const { userId, installationId, githubLogin, accountType } = params;

	return prisma.githubConnection.upsert({
		where: {
			userId_installationId: {
				userId,
				installationId: BigInt(installationId),
			},
		},
		create: {
			userId,
			installationId: BigInt(installationId),
			githubLogin,
			accountType,
		},
		update: { githubLogin, accountType },
		select: {
			id: true,
			userId: true,
			installationId: true,
			githubLogin: true,
			accountType: true,
		},
	});
};

export interface GithubConnectionDTO {
	installationId: string;
	githubLogin: string;
	accountType: string;
	manageUrl: string;
}

// The user's GitHub connections, each with a link to GitHub's installation
// settings page where they can change which repositories the app can access.
// (An app cannot change its own installation's repo selection via the API.)
export const getConnectionsForUser = async (
	userId: string,
): Promise<GithubConnectionDTO[]> => {
	const connections = await prisma.githubConnection.findMany({
		where: { userId },
		select: { installationId: true, githubLogin: true, accountType: true },
	});

	return connections.map((c) => {
		const installationId = c.installationId.toString();
		const manageUrl =
			c.accountType === "Organization"
				? `https://github.com/organizations/${c.githubLogin}/settings/installations/${installationId}`
				: `https://github.com/settings/installations/${installationId}`;
		return {
			installationId,
			githubLogin: c.githubLogin,
			accountType: c.accountType,
			manageUrl,
		};
	});
};

export interface RepoSummary {
	id: string;
	fullName: string;
	isPrivate: boolean;
	githubRepoId: string;
}

export interface PullSummary {
	number: number;
	title: string;
	author: string | null;
	headBranch: string;
	baseBranch: string;
	createdAt: string;
	htmlUrl: string;
}

// List every repo accessible to an installation, following pagination.
const listInstallationRepos = async (installationId: number) => {
	const octokit = getInstallationOctokit(installationId);
	const perPage = 100;
	let page = 1;
	const repos = [];

	for (;;) {
		const { data } = await octokit.request("GET /installation/repositories", {
			per_page: perPage,
			page,
		});
		repos.push(...data.repositories);
		if (data.repositories.length < perPage) break;
		page++;
	}

	return repos;
};

/**
 * Sync + return the session user's repos. Returns null when the user has no
 * GitHub connection (so the caller can answer "not connected" cleanly).
 */
export const getReposForUser = async (
	userId: string,
): Promise<RepoSummary[] | null> => {
	const connections = await prisma.githubConnection.findMany({
		where: { userId },
	});

	if (connections.length === 0) return null;

	const result: RepoSummary[] = [];

	for (const connection of connections) {
		const repos = await listInstallationRepos(Number(connection.installationId));

		for (const repo of repos) {
			const saved = await prisma.repository.upsert({
				where: {
					connectionId_githubRepoId: {
						connectionId: connection.id,
						githubRepoId: BigInt(repo.id),
					},
				},
				create: {
					connectionId: connection.id,
					githubRepoId: BigInt(repo.id),
					owner: repo.owner.login,
					name: repo.name,
					fullName: repo.full_name,
					isPrivate: repo.private,
				},
				update: {
					owner: repo.owner.login,
					name: repo.name,
					fullName: repo.full_name,
					isPrivate: repo.private,
				},
				select: { id: true, fullName: true, isPrivate: true, githubRepoId: true },
			});

			result.push({
				id: saved.id,
				fullName: saved.fullName,
				isPrivate: saved.isPrivate,
				githubRepoId: saved.githubRepoId.toString(),
			});
		}
	}

	return result;
};

// Look up a repo by internal id, scoped to the session user. Returns null if
// it doesn't exist OR isn't owned by this user (caller answers 404 either way).
export const getRepoForUser = async (repoId: string, userId: string) => {
	try {
		return await prisma.repository.findFirst({
			where: { id: repoId, connection: { userId } },
			select: {
				id: true,
				owner: true,
				name: true,
				connection: { select: { installationId: true } },
			},
		});
	} catch {
		// e.g. a malformed (non-uuid) repoId — treat as not found.
		return null;
	}
};

// List OPEN pull requests for a repo, following pagination, trimmed to the
// fields the client needs.
export const listOpenPulls = async (
	installationId: number,
	owner: string,
	repo: string,
): Promise<PullSummary[]> => {
	const octokit = getInstallationOctokit(installationId);
	const perPage = 100;
	let page = 1;
	const pulls: PullSummary[] = [];

	for (;;) {
		const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
			owner,
			repo,
			state: "open",
			per_page: perPage,
			page,
		});

		for (const pr of data) {
			pulls.push({
				number: pr.number,
				title: pr.title,
				author: pr.user?.login ?? null,
				headBranch: pr.head.ref,
				baseBranch: pr.base.ref,
				createdAt: pr.created_at,
				htmlUrl: pr.html_url,
			});
		}

		if (data.length < perPage) break;
		page++;
	}

	return pulls;
};
