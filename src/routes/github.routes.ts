import express from "express";
import {
	githubConnect,
	githubCallback,
	githubConnections,
	githubRepos,
	githubRepoPulls,
} from "../controllers/github.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = express.Router();

router.get("/connect", requireAuth, githubConnect);
router.get("/callback", requireAuth, githubCallback);
router.get("/connection", requireAuth, githubConnections);
router.get("/repos", requireAuth, githubRepos);
router.get("/repos/:repoId/pulls", requireAuth, githubRepoPulls);

export default router;

