import path from "node:path";
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads the `url` from schema.prisma, and it does not
// auto-load .env when a config file is present — hence the dotenv import above.
export default defineConfig({
	schema: path.join("src", "prisma", "schema.prisma"),
	migrations: {
		path: path.join("src", "prisma", "migrations"),
	},
	datasource: {
		url: env("POSTGRES_DATABASE_URL"),
	},
});
