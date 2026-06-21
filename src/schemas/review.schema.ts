import { z } from "zod";

// POST /reviews request body.
export const reviewRequestSchema = z.object({
	repoId: z.string().min(1),
	prNumber: z.coerce.number().int().positive(),
});

export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>;

// PATCH /reviews/:id/issues/:issueId body.
export const toggleIssueSchema = z.object({
	included: z.boolean(),
});

export type ToggleIssueInput = z.infer<typeof toggleIssueSchema>;

// ----- UNTRUSTED model output -----
const severitySchema = z.enum(["critical", "warning", "suggestion"]);
const categorySchema = z.enum([
	"security",
	"performance",
	"correctness",
	"style",
	"accessibility",
]);

export const reviewIssueSchema = z.object({
	file: z.string().min(1),
	line: z.number().int().nullable(),
	severity: severitySchema,
	category: categorySchema,
	message: z.string().min(1),
	suggestedFix: z.string().nullable(),
});

export const reviewOutputSchema = z.object({
	summary: z.string(),
	issues: z.array(reviewIssueSchema),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export type ParseResult =
	| { ok: true; data: ReviewOutput }
	| { ok: false; error: string };

/**
 * Parse the model's response defensively — it is UNTRUSTED. Strips markdown
 * code fences, tolerates malformed JSON, and validates against the schema.
 * Never throws; returns a discriminated result.
 */
export const parseModelReview = (raw: string): ParseResult => {
	let text = (raw ?? "").trim();

	if (text.startsWith("```")) {
		text = text
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/, "")
			.trim();
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, error: "Model returned non-JSON output" };
	}

	const result = reviewOutputSchema.safeParse(parsed);
	if (!result.success) {
		return { ok: false, error: "Model output failed schema validation" };
	}

	return { ok: true, data: result.data };
};
