"use server";

import { prisma } from "@/lib/db/prisma";

/**
 * Fetch all skills for shift requirements
 */
export async function getSkills() {
    try {
        const skills = await prisma.skill.findMany({
            select: {
                id: true,
                name: true,
            },
            orderBy: { name: "asc" }, // optional: sorted alphabetically
        });

        return skills;
    } catch (err) {
        console.error("Failed to fetch skills:", err);
        return []; // return empty array instead of throwing
    }
}
