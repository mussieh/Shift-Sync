"use server";

import { prisma } from "@/lib/db/prisma";

export interface ManagedLocationFrontend {
    id: string;
    name: string;
    timezone: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Fetch all locations managed by a user
 * Throws an error if something goes wrong
 */
export async function getManagedLocations(
    userId: string,
): Promise<ManagedLocationFrontend[]> {
    try {
        const locations = await prisma.location.findMany({
            where: {
                managers: { some: { id: userId } },
            },
            select: {
                id: true,
                name: true,
                timezone: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return locations;
    } catch (err) {
        console.error("Failed to fetch managed locations:", err);
        throw new Error("Could not load locations. Please try again.");
    }
}
