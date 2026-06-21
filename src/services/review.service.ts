import parseDiff from "parse-diff";
import prisma from "../config/db";
import { getInstallationOctokit } from "../lib/github";
import { reviewDiffWithGemini } from "../lib/gemini";
import { parseModelReview } from "../schemas/review.schema";

// Cap total diff characters sent to Gemini (controls cost + latency).
const MAX_DIFF_CHARS = 100_000;

interface ChangedFile {
	filename: string;
	patch?: string;
	status: string;
	additions: number;
	deletions: number;
}

// Generated / lockfile output that adds noise and cost with no review value.
const SKIP_PATTERNS: RegExp[] = [
	/(^|\/)package-lock\.json$/,
	/(^|\/)yarn\.lock$/,
	/(^|\/)pnpm-lock\.yaml$/,
	/(^|\/)composer\.lock$/,
	/(^|\/)Cargo\.lock$/,
	/(^|\/)poetry\.lock$/,
	/(^|\/)(dist|build|out|coverage|vendor|node_modules)\//,
	/\.min\.(js|css)$/,
	/\.map$/,
];

// Secret-like files we must NEVER send to a third-party model.
const SECRET_PATTERNS: RegExp[] = [
	/(^|\/)\.env($|\.)/,
	/\.pem$/,
	/\.key$/,
	/(^|\/)id_rsa/,
	/credentials/i,
	/secrets?\b/i,
];

export const isSkippableFile = (filename: string): boolean =>
	SKIP_PATTERNS.some((re) => re.test(filename));

export const isSecretFile = (filename: string): boolean =>
	SECRET_PATTERNS.some((re) => re.test(filename));

interface BuiltDiff {
	diff: string;
	includedCount: number;
	truncated: boolean;
	skippedSecret: number;
}

export const buildDiff = (files: ChangedFile[]): BuiltDiff => {
	let diff = "";
	let includedCount = 0;
	let truncated = false;
	let skippedSecret = 0;

	for (const file of files) {
		if (isSecretFile(file.filename)) {
			skippedSecret++;
			continue;
		}
		if (!file.patch) continue; // binary / too large to diff
		if (isSkippableFile(file.filename)) continue;

		const block = `\n=== FILE: ${file.filename} (${file.status}, +${file.additions} -${file.deletions}) ===\n${file.patch}\n`;

		if (diff.length + block.length > MAX_DIFF_CHARS) {
			truncated = true;
			break;
		}

		diff += block;
		includedCount++;
	}

	return { diff, includedCount, truncated, skippedSecret };
};

const buildPrompt = (
	prTitle: string,
	diff: string,
	truncated: boolean,
): string => {
	const note = truncated
		? "NOTE: This diff was truncated to fit size limits — not all files are included. Mention this limitation in your summary.\n"
		: "";
	return `Pull request title: ${prTitle}\n${note}\nReview the following unified diffs:\n${diff}`;
};

export interface ReviewIssueDTO {
	id: string;
	file: string;
	line: number | null;
	severity: string;
	category: string;
	message: string;
	suggestedFix: string | null;
	included: boolean;
	posted: boolean;
}

export interface ReviewDTO {
	id: string;
	status: string;
	prNumber: number;
	prTitle: string | null;
	summary: string | null;
	error: string | null;
	createdAt: string;
	completedAt: string | null;
	issues: ReviewIssueDTO[];
}

type ReviewWithIssues = {
	id: string;
	status: string;
	prNumber: number;
	prTitle: string | null;
	summary: string | null;
	error: string | null;
	createdAt: Date;
	completedAt: Date | null;
	issues: Array<{
		id: string;
		filePath: string;
		line: number | null;
		severity: string;
		category: string;
		message: string;
		suggestedFix: string | null;
		included: boolean;
		posted: boolean;
	}>;
};

const toReviewDTO = (review: ReviewWithIssues): ReviewDTO => ({
	id: review.id,
	status: review.status,
	prNumber: review.prNumber,
	prTitle: review.prTitle,
	summary: review.summary,
	error: review.error,
	createdAt: review.createdAt.toISOString(),
	completedAt: review.completedAt ? review.completedAt.toISOString() : null,
	issues: review.issues.map((i) => ({
		id: i.id,
		file: i.filePath,
		line: i.line,
		severity: i.severity,
		category: i.category,
		message: i.message,
		suggestedFix: i.suggestedFix,
		included: i.included,
		posted: i.posted,
	})),
});

const reviewInclude = {
	issues: {
		select: {
			id: true,
			filePath: true,
			line: true,
			severity: true,
			category: true,
			message: true,
			suggestedFix: true,
			included: true,
			posted: true,
		},
	},
} as const;

interface GithubChangedFileResponse {
	filename: string;
	patch?: string;
	status: string;
	additions: number;
	deletions: number;
}

const listPrFiles = async (
	octokit: ReturnType<typeof getInstallationOctokit>,
	owner: string,
	repo: string,
	prNumber: number,
): Promise<ChangedFile[]> => {
	const files: ChangedFile[] = [];
	const perPage = 100;
	let page = 1;

	for (;;) {
		const { data } = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
			{ owner, repo, pull_number: prNumber, per_page: perPage, page },
		);
		for (const f of data as GithubChangedFileResponse[]) {
			files.push({
				filename: f.filename,
				patch: f.patch,
				status: f.status,
				additions: f.additions,
				deletions: f.deletions,
			});
		}
		if (data.length < perPage) break;
		page++;
	}

	return files;
};

export type CreateReviewResult =
	| { ok: true; review: ReviewDTO }
	| { ok: false; code: "NOT_FOUND" };

/**
 * Run a synchronous review for a PR. Scoped to userId: the repo must belong to
 * the session user (repo -> connection -> userId) or we 404.
 */
export const createReview = async (
	userId: string,
	repoId: string,
	prNumber: number,
): Promise<CreateReviewResult> => {
	const repo = await prisma.repository
		.findFirst({
			where: { id: repoId, connection: { userId } },
			select: {
				id: true,
				owner: true,
				name: true,
				connection: { select: { installationId: true } },
			},
		})
		.catch(() => null);

	if (!repo) return { ok: false, code: "NOT_FOUND" };

	const review = await prisma.review.create({
		data: {
			userId,
			repositoryId: repo.id,
			prNumber,
			status: "running",
		},
		select: { id: true },
	});

	try {
		const octokit = getInstallationOctokit(Number(repo.connection.installationId));

		const { data: pr } = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{ owner: repo.owner, repo: repo.name, pull_number: prNumber },
		);

		await prisma.review.update({
			where: { id: review.id },
			data: { prTitle: pr.title },
		});

		const files = await listPrFiles(octokit, repo.owner, repo.name, prNumber);
		const { diff, includedCount, truncated } = buildDiff(files);

		if (includedCount === 0) {
			const empty = await prisma.review.update({
				where: { id: review.id },
				data: {
					status: "completed",
					summary:
						"No reviewable changes (only skipped files such as lockfiles, binaries, or secrets).",
					completedAt: new Date(),
				},
				include: reviewInclude,
			});
			return { ok: true, review: toReviewDTO(empty) };
		}

		const raw = await reviewDiffWithGemini(
			buildPrompt(pr.title, diff, truncated),
		);
		const parsed = parseModelReview(raw);

		if (!parsed.ok) {
			const failed = await prisma.review.update({
				where: { id: review.id },
				data: {
					status: "failed",
					error: parsed.error,
					completedAt: new Date(),
				},
				include: reviewInclude,
			});
			return { ok: true, review: toReviewDTO(failed) };
		}

		if (parsed.data.issues.length > 0) {
			await prisma.reviewIssue.createMany({
				data: parsed.data.issues.map((issue) => ({
					reviewId: review.id,
					filePath: issue.file,
					line: issue.line,
					severity: issue.severity,
					category: issue.category,
					message: issue.message,
					suggestedFix: issue.suggestedFix,
				})),
			});
		}

		const summary = truncated
			? `${parsed.data.summary}\n\n(Note: the diff was truncated; some files were not reviewed.)`
			: parsed.data.summary;

		const completed = await prisma.review.update({
			where: { id: review.id },
			data: { status: "completed", summary, completedAt: new Date() },
			include: reviewInclude,
		});
		return { ok: true, review: toReviewDTO(completed) };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Review failed";
		const failed = await prisma.review.update({
			where: { id: review.id },
			data: {
				status: "failed",
				error: message.slice(0, 500),
				completedAt: new Date(),
			},
			include: reviewInclude,
		});
		return { ok: true, review: toReviewDTO(failed) };
	}
};

// Load one review with issues, scoped to the user. null = not found / not owned.
export const getReviewForUser = async (
	reviewId: string,
	userId: string,
): Promise<ReviewDTO | null> => {
	try {
		const review = await prisma.review.findFirst({
			where: { id: reviewId, userId },
			include: reviewInclude,
		});
		return review ? toReviewDTO(review) : null;
	} catch {
		return null; // malformed (non-uuid) id
	}
};

export type ToggleIssueResult =
	| { ok: true; issue: ReviewIssueDTO }
	| { ok: false; code: "NOT_FOUND" };

// Toggle an issue's `included` flag. The issue must belong to a review owned
// by the user (single scoped query), else NOT_FOUND.
export const setIssueIncluded = async (
	reviewId: string,
	issueId: string,
	userId: string,
	included: boolean,
): Promise<ToggleIssueResult> => {
	const existing = await prisma.reviewIssue
		.findFirst({
			where: { id: issueId, reviewId, review: { userId } },
			select: { id: true },
		})
		.catch(() => null);

	if (!existing) return { ok: false, code: "NOT_FOUND" };

	const issue = await prisma.reviewIssue.update({
		where: { id: issueId },
		data: { included },
		select: {
			id: true,
			filePath: true,
			line: true,
			severity: true,
			category: true,
			message: true,
			suggestedFix: true,
			included: true,
			posted: true,
		},
	});

	return {
		ok: true,
		issue: {
			id: issue.id,
			file: issue.filePath,
			line: issue.line,
			severity: issue.severity,
			category: issue.category,
			message: issue.message,
			suggestedFix: issue.suggestedFix,
			included: issue.included,
			posted: issue.posted,
		},
	};
};

export interface ReviewListItemDTO {
	id: string;
	repoFullName: string;
	prNumber: number;
	prTitle: string | null;
	status: string;
	createdAt: string;
	issueCount: number;
}

// List the user's past reviews, newest first.
export const listReviewsForUser = async (
	userId: string,
): Promise<ReviewListItemDTO[]> => {
	const reviews = await prisma.review.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			prNumber: true,
			prTitle: true,
			status: true,
			createdAt: true,
			repository: { select: { fullName: true } },
			_count: { select: { issues: true } },
		},
	});

	return reviews.map((r) => ({
		id: r.id,
		repoFullName: r.repository.fullName,
		prNumber: r.prNumber,
		prTitle: r.prTitle,
		status: r.status,
		createdAt: r.createdAt.toISOString(),
		issueCount: r._count.issues,
	}));
};

interface PostableIssue {
	id: string;
	filePath: string;
	line: number | null;
	severity: string;
	category: string;
	message: string;
	suggestedFix: string | null;
}

interface InlineComment {
	path: string;
	line: number;
	side: "RIGHT";
	body: string;
}

// Map each changed file to the set of new-file line numbers that are part of
// the diff (added + context lines) — the only lines GitHub accepts a RIGHT-side
// inline comment on. Uses parse-diff rather than hand-rolled hunk math.
export const buildValidLineMap = (
	files: ChangedFile[],
): Map<string, Set<number>> => {
	const map = new Map<string, Set<number>>();
	for (const file of files) {
		if (!file.patch) continue;
		const parsed = parseDiff(
			`--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`,
		);
		const lines = new Set<number>();
		for (const f of parsed) {
			for (const chunk of f.chunks) {
				for (const change of chunk.changes) {
					if (change.type === "add") lines.add(change.ln);
					else if (change.type === "normal") lines.add(change.ln2);
				}
			}
		}
		map.set(file.filename, lines);
	}
	return map;
};

const inlineBody = (issue: PostableIssue): string => {
	const fix = issue.suggestedFix
		? `\n\n**Suggested fix:**\n\`\`\`\n${issue.suggestedFix}\n\`\`\``
		: "";
	return `**${issue.severity} · ${issue.category}**\n\n${issue.message}${fix}`;
};

const summaryLine = (issue: PostableIssue): string => {
	const loc = `\`${issue.filePath}${issue.line !== null ? `:${issue.line}` : ""}\``;
	return `- **${issue.severity} · ${issue.category}** ${loc} — ${issue.message}`;
};

const isUnprocessable = (err: unknown): boolean =>
	typeof err === "object" &&
	err !== null &&
	(err as { status?: number }).status === 422;

// Post one COMMENT review. If GitHub rejects an inline comment's line (422),
// drop one inline comment, fold it into the summary, and retry — bounded by the
// comment count, so one bad line never fails the whole post.
const postReviewWithRetry = async (
	octokit: ReturnType<typeof getInstallationOctokit>,
	owner: string,
	repo: string,
	prNumber: number,
	inline: InlineComment[],
	baseBody: string,
): Promise<{ inline: number; folded: number }> => {
	const comments = [...inline];
	const folded: string[] = [];

	for (;;) {
		const body =
			folded.length > 0
				? `${baseBody}\n\n### Findings that couldn't attach to a diff line\n${folded.join("\n")}`
				: baseBody;

		try {
			await octokit.request(
				"POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
				{ owner, repo, pull_number: prNumber, event: "COMMENT", body, comments },
			);
			return { inline: comments.length, folded: folded.length };
		} catch (err) {
			if (isUnprocessable(err) && comments.length > 0) {
				const bad = comments.pop() as InlineComment;
				folded.push(`- \`${bad.path}:${bad.line}\` — ${bad.body.split("\n")[0]}`);
				continue;
			}
			throw err;
		}
	}
};

export type PostReviewResult =
	| { ok: true; data: { posted: number; inline: number; summary: number } }
	| { ok: false; code: "NOT_FOUND" | "NOT_COMPLETED" | "ERROR" };

/**
 * Post the included, not-yet-posted issues of a completed review back to the
 * GitHub PR as a single COMMENT review (inline where the line is in the diff,
 * otherwise folded into the summary). Scoped to the user; idempotent.
 */
export const postReviewToGithub = async (
	reviewId: string,
	userId: string,
): Promise<PostReviewResult> => {
	const review = await prisma.review
		.findFirst({
			where: { id: reviewId, userId },
			select: {
				id: true,
				status: true,
				prNumber: true,
				summary: true,
				repository: {
					select: {
						owner: true,
						name: true,
						connection: { select: { installationId: true } },
					},
				},
				issues: {
					where: { included: true, posted: false },
					select: {
						id: true,
						filePath: true,
						line: true,
						severity: true,
						category: true,
						message: true,
						suggestedFix: true,
					},
				},
			},
		})
		.catch(() => null);

	if (!review) return { ok: false, code: "NOT_FOUND" };
	if (review.status !== "completed") return { ok: false, code: "NOT_COMPLETED" };

	const issues: PostableIssue[] = review.issues;

	// Idempotent: nothing included-and-unposted to send.
	if (issues.length === 0) {
		return { ok: true, data: { posted: 0, inline: 0, summary: 0 } };
	}

	try {
		const octokit = getInstallationOctokit(
			Number(review.repository.connection.installationId),
		);
		const owner = review.repository.owner;
		const repo = review.repository.name;
		const prNumber = review.prNumber;

		const files = await listPrFiles(octokit, owner, repo, prNumber);
		const validLines = buildValidLineMap(files);

		const inline: InlineComment[] = [];
		const summaryParts: string[] = [];

		for (const issue of issues) {
			const lines = validLines.get(issue.filePath);
			if (issue.line !== null && lines?.has(issue.line)) {
				inline.push({
					path: issue.filePath,
					line: issue.line,
					side: "RIGHT",
					body: inlineBody(issue),
				});
			} else {
				summaryParts.push(summaryLine(issue));
			}
		}

		let baseBody = `## 🤖 AI Code Review\n\n${review.summary ?? ""}`.trim();
		if (summaryParts.length > 0) {
			baseBody += `\n\n### Additional findings\n${summaryParts.join("\n")}`;
		}

		const posted = await postReviewWithRetry(
			octokit,
			owner,
			repo,
			prNumber,
			inline,
			baseBody,
		);

		await prisma.reviewIssue.updateMany({
			where: { id: { in: issues.map((i) => i.id) } },
			data: { posted: true },
		});

		return {
			ok: true,
			data: {
				posted: issues.length,
				inline: posted.inline,
				summary: summaryParts.length + posted.folded,
			},
		};
	} catch {
		return { ok: false, code: "ERROR" };
	}
};
