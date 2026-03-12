"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "./user";
import { Role, SwapStatus } from "../../../generated/prisma/client";

// ----------------------
// Types
// ----------------------
interface StaffStats {
    role: "STAFF";
    firstName: string;
    upcomingShifts: number;
    weeklyHours: number;
    pendingSwaps: number;
}

interface ManagerAdminStats {
    role: "MANAGER" | "ADMIN";
    firstName: string;
    pendingApprovals: number;
    totalStaff: number;
    onDutyAssignments: {
        user: { firstName: string; lastName: string };
        shift: { startTime: Date; endTime: Date; location: { name: string } };
        location: { name: string };
    }[];
}

export type DashboardStats = StaffStats | ManagerAdminStats;

// -----------------------
// Fetch Dashboard Stats
// -----------------------
export async function fetchDashboardStats(): Promise<DashboardStats> {
    const user = await requireAuth();
    const userId = user.id;

    const fullUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { managedLocations: { select: { id: true } } },
    });
    if (!fullUser) throw new Error("User not found");

    const now = new Date();

    // -------------------
    // STAFF DASHBOARD
    // -------------------
    if (fullUser.role === "STAFF") {
        const [counts] = await prisma.$queryRaw<
            {
                upcomingShifts: number;
                weeklyHours: number;
                pendingSwaps: number;
            }[]
        >`
      SELECT
        COUNT(*) FILTER (WHERE sa."userId" = ${userId} AND shift."startTime" >= ${now}) AS "upcomingShifts",
        COALESCE(SUM(EXTRACT(EPOCH FROM (shift."endTime" - shift."startTime"))/3600),0) AS "weeklyHours",
        COUNT(*) FILTER (WHERE sr."status"='PENDING' AND sr."fromUserId"=${userId}) AS "pendingSwaps"
      FROM "ShiftAssignment" sa
      LEFT JOIN "Shift" shift ON sa."shiftId" = shift.id
      LEFT JOIN "SwapRequest" sr ON sr."fromUserId" = sa."userId";
    `;

        return {
            role: "STAFF",
            firstName: fullUser.firstName,
            upcomingShifts: Number(counts.upcomingShifts),
            weeklyHours: Number(counts.weeklyHours.toFixed(1)),
            pendingSwaps: Number(counts.pendingSwaps),
        };
    }

    // -------------------
    // MANAGER / ADMIN DASHBOARD
    // -------------------
    const locationIds =
        fullUser.role === "MANAGER"
            ? fullUser.managedLocations.map((l) => l.id)
            : undefined; // undefined = all locations for admin

    const [onDutyAssignmentsRaw, pendingApprovals, totalStaff] =
        await Promise.all([
            prisma.shiftAssignment.findMany({
                where: {
                    shift: {
                        startTime: { lte: now },
                        endTime: { gte: now },
                        ...(locationIds
                            ? { locationId: { in: locationIds } }
                            : {}),
                    },
                },
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
                orderBy: { shift: { startTime: "asc" } },
            }),
            prisma.swapRequest.count({ where: { status: SwapStatus.PENDING } }),
            prisma.user.count({ where: { role: Role.STAFF } }),
        ]);

    // Convert shift times to JS Date
    const onDutyAssignments = onDutyAssignmentsRaw.map((a) => ({
        user: a.user,
        shift: {
            ...a.shift,
            startTime: new Date(a.shift.startTime),
            endTime: new Date(a.shift.endTime),
        },
        location: { name: a.shift.location.name },
    }));

    return {
        role: fullUser.role,
        firstName: fullUser.firstName,
        pendingApprovals,
        totalStaff,
        onDutyAssignments,
    };
}
