"use server";

import { prisma } from "../db/prisma";

/** Return type for eligible staff */
export interface EligibleStaff {
    id: string;
    firstName: string;
    lastName: string;
    skills: { id: string; name: string }[];
}

/** Result wrapper */
export interface EligibleStaffResult {
    success: boolean;
    data?: EligibleStaff[];
    error?: string;
}

/**
 * Fetch staff eligible for a location based on certifications and skills.
 * Optimized for performance and type safety.
 */
export async function getEligibleStaffForLocation(
    locationId: string,
): Promise<EligibleStaffResult> {
    try {
        if (!locationId) {
            return { success: false, error: "locationId is required" };
        }

        // Fetch staff with certifications at this location
        const staff = await prisma.user.findMany({
            where: {
                role: "STAFF",
                certifications: { some: { locationId } },
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                certifications: {
                    select: {
                        skills: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        // Map certifications -> skills (flatten)
        const eligibleStaff: EligibleStaff[] = staff.map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            skills: Array.from(
                new Map(
                    u.certifications.flatMap(
                        (c) => c.skills?.map((s) => [s.id, s] as const) ?? [],
                    ),
                ).values(),
            ),
        }));

        return { success: true, data: eligibleStaff };
    } catch (err) {
        console.error("getEligibleStaffForLocation error:", err);
        return { success: false, error: "Failed to fetch eligible staff" };
    }
}
