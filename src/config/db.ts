import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.POSTGRES_DATABASE_URL;

if (!connectionString) {
	throw new Error("POSTGRES_DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

// globalThis guard prevents hot-reload from creating duplicate PrismaClients and exhausting the connection pool.
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

export default prisma;
