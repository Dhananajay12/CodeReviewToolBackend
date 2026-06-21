import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	NODE_PORT: z.coerce.number().int().positive().default(3000),
	POSTGRES_DATABASE_URL: z.string().min(1, "POSTGRES_DATABASE_URL is required"),
	GOOGLE_GEMINI_KEY: z.string().min(1).optional(),
	FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
	GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
	GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
	GOOGLE_REDIRECT_URI: z
		.string()
		.url()
		.default("http://localhost:5000/auth/google/callback"),
	GITHUB_APP_ID: z.coerce.number().int().positive(),
	GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
	GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
	// Normalize \n escapes to real newlines so a single-line .env value works too.
	GITHUB_APP_PRIVATE_KEY: z
		.string()
		.min(1, "GITHUB_APP_PRIVATE_KEY is required")
		.transform((key) => key.replace(/\\n/g, "\n")),
});

const response = envSchema.safeParse(process.env);

if (!response.success) {
	const invalidKeys = response.error.issues.map((issue) => issue.path.join("."));
	console.error("❌ Invalid environment variables:", invalidKeys.join(", "));
	throw new Error("Invalid environment variables");
}

export const env = response.data;

export type Env = typeof env;

export const isProduction: boolean = env.NODE_ENV === "production";
