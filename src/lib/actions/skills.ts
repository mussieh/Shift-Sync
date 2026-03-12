"use server";

import { prisma } from "@/lib/db/prisma";

/**
 * Fetch all skills for shift requirements
 */
export async function getSkills() {
    try {
        return await prisma.skill.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });
    } catch (err) {
        console.error("Failed to fetch skills:", err);
        return [];
    }
}
