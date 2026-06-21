import type { Request, Response, NextFunction } from "express";
import { validateSessionToken } from "../lib/session";
import { SESSION_COOKIE_NAME } from "../lib/cookies";
import { customResponse } from "../helpers/Response";

export const requireAuth = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	const token: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];

	if (!token) {
		res.json(customResponse("Unauthorized", false, 401, null));
		return;
	}

	const user = await validateSessionToken(token);

	if (!user) {
		res.json(customResponse("Unauthorized", false, 401, null));
		return;
	}

	req.userId = user.id;
	next();
};
