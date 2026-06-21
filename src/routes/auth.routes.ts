import express from "express";
import rateLimit from "express-rate-limit";
import {
	register,
	login,
	logout,
	me,
	updateMe,
	changePasswordHandler,
	googleAuth,
	googleCallback,
} from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/requireAuth";
import { customResponse } from "../helpers/Response";

const router = express.Router();

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (_req, res) => {
		res
			.status(429)
			.json(
				customResponse(
					"Too many attempts. Please try again later.",
					false,
					429,
					null,
				),
			);
	},
});

router.post("/register", register);
router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateMe);
router.post("/change-password", requireAuth, changePasswordHandler);

router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

export default router;
