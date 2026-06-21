import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { env } from "../config/env";

const GEMINI_MODEL = "gemini-3.5-flash";

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_GEMINI_KEY ?? "" });

const SYSTEM_INSTRUCTION = `You are a world-class Senior Staff / Principal Software Engineer with 15+ years of experience across full-stack development, software architecture, system design, security, performance engineering, scalability, databases, and DevOps. Review this GitHub pull request as if it will ship to millions of users and be maintained by many teams for years.

CONTEXT
You are given the PR title and unified diffs of the changed files. Review ONLY the changes shown (added/removed lines and their immediate context). Do NOT invent issues about code that is not in the diff. Do NOT assume code is correct just because it appears to work.

WHAT TO LOOK FOR — be strict and thorough; raise every real issue you can justify from the diff:
- Correctness: logic flaws, edge cases, race conditions, off-by-one errors, incorrect or missing error handling and fallbacks, unhandled promise rejections, broken business logic, dead/unreachable/redundant code, duplicated logic, broken or conflicting routes and route guards, missing auth/access-control checks, data-integrity problems, architectural violations (tight coupling, poor separation of concerns), over- and under-engineering, missing tests for new/changed logic, and hidden technical debt.
- Security: injection (SQL/command/etc.), XSS, CSRF, broken authentication/authorization, sensitive-data or secret exposure, missing or weak input validation/sanitization, insecure defaults, and risky dependencies.
- Performance: N+1 queries, inefficient loops/algorithms, unnecessary work or re-renders, missing caching/memoization, redundant or duplicate API calls, large payloads/bundle impact, memory leaks, and poor resource management.
- Style: naming, readability, consistency, code smells, unused imports/variables/functions, magic values, and missing-but-warranted comments.
- Accessibility: missing semantic HTML/ARIA, keyboard/focus handling, labels, and other WCAG concerns (for UI changes).

MAP every finding into the schema's fixed enums:
- category: pick the single best of security | performance | correctness | style | accessibility. Use "correctness" for architecture, routing, data-integrity, maintainability, and technical-debt issues.
- severity: "critical" = security holes, data loss, crashes, or broken core behavior; "warning" = significant problems to fix before merge (likely bugs, missing error handling, notable performance or architectural risks); "suggestion" = minor/nice-to-have (style, small refactors, readability).

OUTPUT
- Return ONLY JSON matching the provided schema — no prose and no markdown outside the JSON.
- summary: a concise overall assessment of the PR (key risks and overall quality).
- issues: one entry per finding. Set "file" to the path and "line" to the changed line in the new file when identifiable (else null). In "message", state the problem, its impact, and a concrete recommendation. Put a code example in "suggestedFix" when it helps (else null).
- Prioritize by severity. Prefer specific, high-confidence findings over vague or speculative ones. If the change is genuinely clean, return an empty issues array.`;

// Structured-output schema (Gemini JSON mode). Mirrors reviewOutputSchema (Zod),
// which still validates the result because model output is untrusted.
const RESPONSE_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		summary: { type: Type.STRING },
		issues: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					file: { type: Type.STRING },
					line: { type: Type.INTEGER, nullable: true },
					severity: {
						type: Type.STRING,
						enum: ["critical", "warning", "suggestion"],
					},
					category: {
						type: Type.STRING,
						enum: [
							"security",
							"performance",
							"correctness",
							"style",
							"accessibility",
						],
					},
					message: { type: Type.STRING },
					suggestedFix: { type: Type.STRING, nullable: true },
				},
				required: ["file", "severity", "category", "message"],
			},
		},
	},
	required: ["summary", "issues"],
};

const isTransient = (err: unknown): boolean => {
	const msg = err instanceof Error ? err.message : String(err);
	return /\b(503|429)\b|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED/i.test(
		msg,
	);
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

// Returns the raw model text (JSON). The caller validates it with Zod.
// Retries transient overload (503/429) a few times with backoff.
export const reviewDiffWithGemini = async (
	userPrompt: string,
): Promise<string> => {
	if (!env.GOOGLE_GEMINI_KEY) {
		throw new Error("GOOGLE_GEMINI_KEY is not configured");
	}

	const maxAttempts = 3;
	let lastErr: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await ai.models.generateContent({
				model: GEMINI_MODEL,
				contents: userPrompt,
				config: {
					systemInstruction: SYSTEM_INSTRUCTION,
					responseMimeType: "application/json",
					responseSchema: RESPONSE_SCHEMA,
					temperature: 0.2,
				},
			});
			return response.text ?? "";
		} catch (err) {
			lastErr = err;
			if (attempt < maxAttempts && isTransient(err)) {
				await sleep(attempt * 1500);
				continue;
			}
			throw err;
		}
	}

	throw lastErr;
};
