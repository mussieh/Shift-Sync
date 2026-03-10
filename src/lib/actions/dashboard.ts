"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "./user";
import { Role, SwapStatus } from "../../../generated/prisma/client";

/**
 * Returns start and end Date objects for the current week (Sunday -> Saturday)
 */
function getWeekRange(referenceDate = new Date()) {
    const start = new Date(referenceDate);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

/**
 * Fetches dashboard stats for the logged-in user.
 * Optimized for both STAFF and MANAGER/ADMIN dashboards.
 * @param onDutyLimit Number of "on duty now" assignments to fetch for manager/admin
 */
export async function fetchDashboardStats({ onDutyLimit = 10 } = {}) {
    // 1️⃣ Get logged-in user
    const user = await requireAuth();
    const userId = user.id;

    // 2️⃣ Fetch user + managed locations (for managers)
    const fullUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { managedLocations: { select: { id: true } } },
    });
    if (!fullUser) throw new Error("User not found");

    const now = new Date();

    // -------------------
    // STAFF DASHBOARD
    // -------------------
    if (fullUser.role === Role.STAFF) {
        const { start: weekStart, end: weekEnd } = getWeekRange(now);

        // Parallel queries for speed
        const [upcomingShiftsCount, weeklyHoursResult, pendingSwaps] =
            await Promise.all([
                // Count upcoming shifts
                prisma.shiftAssignment.count({
                    where: {
                        userId,
                        shift: { startTime: { gte: now } },
                    },
                }),

                // Sum weekly hours directly in DB
                prisma.$queryRaw<{ weeklyHours: number }[]>`
                    SELECT
                        COALESCE(SUM(EXTRACT(EPOCH FROM ("shift"."endTime" - "shift"."startTime")) / 3600),0) AS "weeklyHours"
                    FROM "ShiftAssignment" AS "sa"
                    INNER JOIN "Shift" AS "shift" ON "sa"."shiftId" = "shift"."id"
                    WHERE "sa"."userId" = ${userId}
                      AND "shift"."startTime" >= ${weekStart}
                      AND "shift"."startTime" < ${weekEnd}
                `,

                // Count pending swaps
                prisma.swapRequest.count({
                    where: { fromUserId: userId, status: SwapStatus.PENDING },
                }),
            ]);

        const weeklyHours = weeklyHoursResult[0]?.weeklyHours ?? 0;

        return {
            role: fullUser.role,
            firstName: fullUser.firstName,
            upcomingShifts: upcomingShiftsCount,
            weeklyHours: Number(weeklyHours.toFixed(1)),
            pendingSwaps,
        };
    }

    // -------------------
    // MANAGER / ADMIN DASHBOARD
    // -------------------
    const locationIds =
        fullUser.role === Role.MANAGER
            ? fullUser.managedLocations.map((l) => l.id)
            : [];

    const [onDutyAssignments, pendingApprovals, totalStaff] = await Promise.all(
        [
            // Get currently on-duty assignments (top N)
            prisma.shiftAssignment.findMany({
                where: {
                    shift: {
                        startTime: { lte: now },
                        endTime: { gte: now },
                        ...(fullUser.role === Role.MANAGER && {
                            locationId: { in: locationIds },
                        }),
                    },
                },
                take: onDutyLimit,
                orderBy: { shift: { startTime: "asc" } },
                select: {
                    user: { select: { firstName: true, lastName: true } },
                    shift: {
                        select: {
                            startTime: true,
                            endTime: true,
                            location: { select: { name: true } },
                        },
                    },
                },
            }),

            // Pending swap requests count
            prisma.swapRequest.count({ where: { status: SwapStatus.PENDING } }),

            // Total staff count
            prisma.user.count({ where: { role: Role.STAFF } }),
        ],
    );

    return {
        role: fullUser.role,
        firstName: fullUser.firstName,
        onDutyAssignments,
        pendingApprovals,
        totalStaff,
    };
}
