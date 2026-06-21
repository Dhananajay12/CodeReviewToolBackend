import type { Request, Response } from "express";
import { customResponse } from "../helpers/Response";
import {
	reviewRequestSchema,
	toggleIssueSchema,
} from "../schemas/review.schema";
import {
	createReview,
	getReviewForUser,
	setIssueIncluded,
	listReviewsForUser,
	postReviewToGithub,
} from "../services/review.service";

// POST /reviews — requireAuth. Synchronously review a PR on the user's repo.
export const postReview = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const parsed = reviewRequestSchema.safeParse(req.body);

	if (!parsed.success) {
		res.json(customResponse("Invalid input", false, 400, null));
		return;
	}

	const result = await createReview(
		req.userId as string,
		parsed.data.repoId,
		parsed.data.prNumber,
	);

	if (!result.ok) {
		res.json(customResponse("Repository not found", false, 404, null));
		return;
	}

	res.json(customResponse("Review complete", true, 200, result.review));
};

// GET /reviews — requireAuth. List the user's past reviews, newest first.
export const listReviews = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const reviews = await listReviewsForUser(req.userId as string);
	res.json(customResponse("Reviews", true, 200, reviews));
};

// GET /reviews/:id — requireAuth. Load one review (with issues) the user owns.
export const getReview = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const review = await getReviewForUser(
		String(req.params.id),
		req.userId as string,
	);

	if (!review) {
		res.json(customResponse("Review not found", false, 404, null));
		return;
	}

	res.json(customResponse("Review", true, 200, review));
};

// PATCH /reviews/:id/issues/:issueId — requireAuth. Toggle an issue's included flag.
export const patchIssueIncluded = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const parsed = toggleIssueSchema.safeParse(req.body);

	if (!parsed.success) {
		res.json(customResponse("Invalid input", false, 400, null));
		return;
	}

	const result = await setIssueIncluded(
		String(req.params.id),
		String(req.params.issueId),
		req.userId as string,
		parsed.data.included,
	);

	if (!result.ok) {
		res.json(customResponse("Issue not found", false, 404, null));
		return;
	}

	res.json(customResponse("Issue updated", true, 200, result.issue));
};

// POST /reviews/:id/post — requireAuth. Post the selected comments to the PR.
export const postReviewComments = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const result = await postReviewToGithub(
		String(req.params.id),
		req.userId as string,
	);

	if (!result.ok) {
		if (result.code === "NOT_FOUND") {
			res.json(customResponse("Review not found", false, 404, null));
			return;
		}
		if (result.code === "NOT_COMPLETED") {
			res.json(
				customResponse("Review is not completed", false, 400, null),
			);
			return;
		}
		res.json(customResponse("Failed to post review", false, 500, null));
		return;
	}

	res.json(customResponse("Review posted", true, 200, result.data));
};
