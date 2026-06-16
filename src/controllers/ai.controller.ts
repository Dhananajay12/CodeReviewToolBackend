import { Request, Response } from "express";
import { generateContentFun } from "../services/ai.service";

export const getCodeReview = async (req: Request, res: Response) => {
	const code = req.body.code;

	if (!code) {
		res.status(400).send("Prompt is required");
		return;
	}

	const response = await generateContentFun(code);

	res.send(response);
};
