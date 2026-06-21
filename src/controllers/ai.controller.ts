import { Request, Response } from "express";
import { generateContentFun } from "../services/ai.service";
import { CustomResponse } from "../helpers/Response";

export const getCodeReview = async (req: Request, res: Response) => {
	const code = req.body.code;

	if (!code) {
		res.json(CustomResponse("Prompt is required", false, 400, null, null));
		return;
	}

	const response = await generateContentFun(code);

	if (response.status === false) {
		res.json(
			CustomResponse(
				"Failed to generate code review",
				false,
				500,
				null,
				response.error,
			),
		);
		return;
	}

	res.json(
		CustomResponse(
			"Code Review generated Successfully",
			true,
			200,
			response.data,
			null,
		),
	);
};
