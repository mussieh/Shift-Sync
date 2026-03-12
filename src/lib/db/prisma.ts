import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;

// Create adapter
const adapter = new PrismaPg({ connectionString });

// Extend global type to avoid multiple instances in dev
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Create Prisma instance with adapter
export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        adapter,
        transactionOptions: {
            maxWait: 10_000, // 10 seconds
            timeout: 60_000, // 60 seconds
        },
    });

// Store instance globally in dev to avoid multiple clients
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
