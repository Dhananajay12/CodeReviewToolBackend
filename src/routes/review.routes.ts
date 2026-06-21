import express from "express";
import {
	postReview,
	listReviews,
	getReview,
	patchIssueIncluded,
	postReviewComments,
} from "../controllers/review.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = express.Router();

router.post("/", requireAuth, postReview);
router.get("/", requireAuth, listReviews);
router.get("/:id", requireAuth, getReview);
router.patch("/:id/issues/:issueId", requireAuth, patchIssueIncluded);
router.post("/:id/post", requireAuth, postReviewComments);

export default router;
