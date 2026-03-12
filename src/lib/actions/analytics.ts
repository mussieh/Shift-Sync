"use server";

import { prisma } from "@/lib/db/prisma";
import { isPremiumShift } from "@/lib/constants";

export interface StaffHoursSummary {
    userId: string;
    firstName: string;
    lastName: string;
    desiredHours: number;
    scheduledHours: number;
    dailyHours: { date: string; hours: number; shiftIds: string[] }[];
    premiumShifts: number;
    consecutiveDays: number;
    overtimeRisk: "none" | "warning" | "overtime";
    dailyViolations: {
        date: string;
        hours: number;
        type: "warning" | "block";
    }[];
    consecutiveDayWarning: "sixth" | "seventh" | null;
    overtimeHours: number;
}

export interface OvertimeCostSummary {
    totalRegularHours: number;
    totalOvertimeHours: number;
    projectedOvertimeCost: number;
    affectedStaff: {
        userId: string;
        name: string;
        overtimeHours: number;
        estimatedCost: number;
    }[];
}

export interface FairnessSummary {
    fairnessScore: number;
    avgPremiumShifts: number;
    premiumVariance: number;
    staff: {
        userId: string;
        name: string;
        premiumShifts: number;
        scheduledHours: number;
        desiredHours: number;
    }[];
}

export interface WhatIfImpact {
    userId: string;
    name: string;
    currentHours: number;
    newHours: number;
    overtimeTrigger: boolean;
    dailyHoursAfter: number;
    consecutiveDaysAfter: number;
    warnings: string[];
    blocked: boolean;
    blockReasons: string[];
}

const OVERTIME_RATE = 1.5;
const BASE_HOURLY_RATE = 20; // default rate when not stored

export async function getAnalyticsData(
    weekStart: Date,
    locationIds: string[],
): Promise<{
    staffSummaries: StaffHoursSummary[];
    overtimeCost: OvertimeCostSummary;
    fairness: FairnessSummary;
}> {
    try {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        // Fetch all shifts for the week at these locations
        const shifts = await prisma.shift.findMany({
            where: {
                date: { gte: weekStart, lt: weekEnd },
                locationId:
                    locationIds.length > 0 ? { in: locationIds } : undefined,
            },
            include: {
                assignments: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                desiredHours: true,
                            },
                        },
                    },
                },
                location: true,
            },
            orderBy: { startTime: "asc" },
        });

        // Get all staff users
        const staffUsers = await prisma.user.findMany({
            where: { role: "STAFF" },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                desiredHours: true,
            },
        });

        const staffMap = new Map(staffUsers.map((u) => [u.id, u]));

        // Build per-user shift data
        const userShiftsMap = new Map<string, typeof shifts>();

        for (const shift of shifts) {
            for (const assignment of shift.assignments) {
                const uid = assignment.userId;
                if (!userShiftsMap.has(uid)) userShiftsMap.set(uid, []);
                userShiftsMap.get(uid)!.push(shift);
            }
        }

        const staffSummaries: StaffHoursSummary[] = [];

        for (const [userId, userShifts] of userShiftsMap.entries()) {
            const user = staffMap.get(userId);
            if (!user) continue;

            // Daily hours
            const dailyMap = new Map<
                string,
                { hours: number; shiftIds: string[] }
            >();
            let totalHours = 0;
            let premiumCount = 0;

            for (const shift of userShifts) {
                const hours =
                    (new Date(shift.endTime).getTime() -
                        new Date(shift.startTime).getTime()) /
                    3600000;
                totalHours += hours;

                const dateKey = new Date(shift.date)
                    .toISOString()
                    .split("T")[0];
                if (!dailyMap.has(dateKey))
                    dailyMap.set(dateKey, { hours: 0, shiftIds: [] });
                const day = dailyMap.get(dateKey)!;
                day.hours += hours;
                day.shiftIds.push(shift.id);

                if (
                    isPremiumShift(
                        new Date(shift.startTime),
                        new Date(shift.endTime),
                    )
                ) {
                    premiumCount++;
                }
            }

            // Daily violations
            const dailyViolations: StaffHoursSummary["dailyViolations"] = [];
            for (const [date, { hours }] of dailyMap.entries()) {
                if (hours > 12)
                    dailyViolations.push({ date, hours, type: "block" });
                else if (hours > 8)
                    dailyViolations.push({ date, hours, type: "warning" });
            }

            // Consecutive days
            const workedDates = Array.from(dailyMap.keys()).sort();
            let maxConsecutive = 0;
            let currentConsecutive = 1;
            for (let i = 1; i < workedDates.length; i++) {
                const prev = new Date(workedDates[i - 1]);
                const curr = new Date(workedDates[i]);
                const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
                if (diffDays === 1) {
                    currentConsecutive++;
                    maxConsecutive = Math.max(
                        maxConsecutive,
                        currentConsecutive,
                    );
                } else {
                    currentConsecutive = 1;
                }
            }
            if (workedDates.length === 1) maxConsecutive = 1;

            const consecutiveDayWarning: StaffHoursSummary["consecutiveDayWarning"] =
                maxConsecutive >= 7
                    ? "seventh"
                    : maxConsecutive >= 6
                      ? "sixth"
                      : null;

            const overtimeRisk: StaffHoursSummary["overtimeRisk"] =
                totalHours >= 40
                    ? "overtime"
                    : totalHours >= 35
                      ? "warning"
                      : "none";

            staffSummaries.push({
                userId,
                firstName: user.firstName,
                lastName: user.lastName,
                desiredHours: user.desiredHours ?? 0,
                scheduledHours: totalHours,
                dailyHours: Array.from(dailyMap.entries()).map(([date, v]) => ({
                    date,
                    hours: v.hours,
                    shiftIds: v.shiftIds,
                })),
                premiumShifts: premiumCount,
                consecutiveDays: maxConsecutive,
                overtimeRisk,
                dailyViolations,
                consecutiveDayWarning,
                overtimeHours: Math.max(0, totalHours - 40),
            });
        }

        // Overtime cost
        const overtimeStaff = staffSummaries
            .filter((s) => s.overtimeHours > 0)
            .map((s) => ({
                userId: s.userId,
                name: `${s.firstName} ${s.lastName}`,
                overtimeHours: s.overtimeHours,
                estimatedCost:
                    s.overtimeHours * BASE_HOURLY_RATE * OVERTIME_RATE,
            }));

        const totalOvertimeHours = overtimeStaff.reduce(
            (sum, s) => sum + s.overtimeHours,
            0,
        );
        const totalRegularHours = staffSummaries.reduce(
            (sum, s) => sum + Math.min(s.scheduledHours, 40),
            0,
        );

        const overtimeCost: OvertimeCostSummary = {
            totalRegularHours,
            totalOvertimeHours,
            projectedOvertimeCost: overtimeStaff.reduce(
                (sum, s) => sum + s.estimatedCost,
                0,
            ),
            affectedStaff: overtimeStaff,
        };

        // Fairness
        const allPremium = staffSummaries.map((s) => s.premiumShifts);
        const avgPremium =
            allPremium.length > 0
                ? allPremium.reduce((a, b) => a + b, 0) / allPremium.length
                : 0;
        const variance =
            allPremium.length > 0
                ? allPremium.reduce(
                      (sum, v) => sum + Math.pow(v - avgPremium, 2),
                      0,
                  ) / allPremium.length
                : 0;
        const fairnessScore = Math.max(0, Math.min(100, 100 - variance * 20));

        const fairness: FairnessSummary = {
            fairnessScore,
            avgPremiumShifts: avgPremium,
            premiumVariance: variance,
            staff: staffSummaries.map((s) => ({
                userId: s.userId,
                name: `${s.firstName} ${s.lastName}`,
                premiumShifts: s.premiumShifts,
                scheduledHours: s.scheduledHours,
                desiredHours: s.desiredHours,
            })),
        };

        return { staffSummaries, overtimeCost, fairness };
    } catch (err) {
        console.error("getAnalyticsData error:", err);
        return {
            staffSummaries: [],
            overtimeCost: {
                totalRegularHours: 0,
                totalOvertimeHours: 0,
                projectedOvertimeCost: 0,
                affectedStaff: [],
            },
            fairness: {
                fairnessScore: 100,
                avgPremiumShifts: 0,
                premiumVariance: 0,
                staff: [],
            },
        };
    }
}

export async function getWhatIfImpact(
    shiftId: string,
    staffId: string,
    weekStart: Date,
    locationIds: string[],
): Promise<WhatIfImpact | null> {
    try {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const [targetShift, existingData] = await Promise.all([
            prisma.shift.findUnique({
                where: { id: shiftId },
                include: { location: true },
            }),
            getAnalyticsData(weekStart, locationIds),
        ]);

        if (!targetShift) return null;

        const staffSummary = existingData.staffSummaries.find(
            (s) => s.userId === staffId,
        );
        const user = await prisma.user.findUnique({
            where: { id: staffId },
            select: { firstName: true, lastName: true },
        });
        if (!user) return null;

        const shiftHours =
            (new Date(targetShift.endTime).getTime() -
                new Date(targetShift.startTime).getTime()) /
            3600000;
        const currentHours = staffSummary?.scheduledHours ?? 0;
        const newHours = currentHours + shiftHours;

        const warnings: string[] = [];
        const blockReasons: string[] = [];

        // Check overtime
        if (newHours >= 40 && currentHours < 40)
            warnings.push("This assignment will trigger overtime.");
        if (newHours >= 35 && newHours < 40)
            warnings.push("Staff will approach overtime threshold (35h+).");

        // Check daily hours after
        const shiftDate = new Date(targetShift.date)
            .toISOString()
            .split("T")[0];
        const existingDayHours =
            staffSummary?.dailyHours.find((d) => d.date === shiftDate)?.hours ??
            0;
        const dailyHoursAfter = existingDayHours + shiftHours;

        if (dailyHoursAfter > 12)
            blockReasons.push(
                `Daily hours would exceed 12h (${dailyHoursAfter.toFixed(1)}h).`,
            );
        else if (dailyHoursAfter > 8)
            warnings.push(
                `Daily hours would exceed 8h (${dailyHoursAfter.toFixed(1)}h).`,
            );

        // Consecutive days
        const consecutiveDaysAfter = (staffSummary?.consecutiveDays ?? 0) + 1;
        if (consecutiveDaysAfter >= 7)
            blockReasons.push(
                "7th consecutive day — requires manager override.",
            );
        else if (consecutiveDaysAfter >= 6)
            warnings.push("6th consecutive day worked in a week.");

        return {
            userId: staffId,
            name: `${user.firstName} ${user.lastName}`,
            currentHours,
            newHours,
            overtimeTrigger: newHours >= 40 && currentHours < 40,
            dailyHoursAfter,
            consecutiveDaysAfter,
            warnings,
            blocked: blockReasons.length > 0,
            blockReasons,
        };
    } catch (err) {
        console.error("getWhatIfImpact error:", err);
        return null;
    }
}
