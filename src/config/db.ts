import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 connects through a driver adapter. We reuse the pg driver and the
// same POSTGRES_DATABASE_URL the rest of the app uses.
const connectionString = process.env.POSTGRES_DATABASE_URL;

if (!connectionString) {
	throw new Error("POSTGRES_DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

// Guard against hot-reload (tsx watch / nodemon) creating a new PrismaClient on
// every reload, which would otherwise exhaust the database connection pool.
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

export default prisma;
