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
 * Fetch locations a user can manage
 * - Admins get all locations
 * - Managers get only locations they manage
 * - Staff get an empty array (they don't manage locations)
 */
export async function getManagedLocations(
    userId: string,
    role: "ADMIN" | "MANAGER" | "STAFF",
): Promise<ManagedLocationFrontend[]> {
    try {
        if (role === "STAFF") return []; // Staff don't manage locations

        const where =
            role === "ADMIN"
                ? {} // Admin: all locations
                : { managers: { some: { id: userId } } }; // Manager: only managed locations

        const locations = await prisma.location.findMany({
            where,
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
        console.error("Failed to fetch locations:", err);
        throw new Error("Could not load locations. Please try again.");
    }
}
