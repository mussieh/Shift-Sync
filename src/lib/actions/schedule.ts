"use server";

import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { format, formatInTimeZone } from "date-fns-tz";
import { Prisma, User } from "../../../generated/prisma/client";

/** Constants */
const MIN_REST_HOURS = 10;
const PUBLISH_CUTOFF_HOURS = 48;

/** Frontend representation of shift details */
export interface ShiftDetailFrontend {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    isPremium: boolean;
    status: "DRAFT" | "PUBLISHED";
    location: { id: string; name: string; timezone: string };
    assignments: {
        id: string;
        user: {
            id: string;
            firstName: string;
            lastName: string;
            role: "ADMIN" | "MANAGER" | "STAFF";
        };
    }[];
    requirements: {
        id: string;
        quantity: number;
        skill: { id: string; name: string };
    }[];
    swapRequests: {
        id: string;
        status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
        fromUser?: {
            id: string;
            firstName: string;
            lastName: string;
            role: "ADMIN" | "MANAGER" | "STAFF";
        };
        toUser?: {
            id: string;
            firstName: string;
            lastName: string;
            role: "ADMIN" | "MANAGER" | "STAFF";
        };
    }[];
    dropRequests: {
        id: string;
        status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
        offeredBy: {
            id: string;
            firstName: string;
            lastName: string;
            role: "ADMIN" | "MANAGER" | "STAFF";
        };
        claimedBy?: {
            id: string;
            firstName: string;
            lastName: string;
            role: "ADMIN" | "MANAGER" | "STAFF";
        };
    }[];
}

/** Constraint result for staff assignment */
interface ConstraintResult {
    allowed: boolean;
    errors: string[];
    suggestions: { userId: string; reason: string }[];
}

/** Week frontend shift */
export interface WeekShiftFrontend {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    location: { id: string; name: string; timezone: string };
    status?: "DRAFT" | "PUBLISHED";
    isPremium?: boolean;
    assignments?: { id: string; userId: string }[];
}

/** Map Prisma User → frontend format */
const mapUser = (user: User | null | undefined) =>
    user
        ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
          }
        : undefined;

/** Run assignment constraints with try/catch and best practices */
export async function runAssignmentConstraints(
    shiftId: string,
    userId: string,
): Promise<ConstraintResult> {
    try {
        const errors: string[] = [];
        const suggestions: { userId: string; reason: string }[] = [];

        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: {
                location: true,
                requirements: { include: { skill: true } },
            },
        });
        if (!shift)
            return { allowed: false, errors: ["Shift not found"], suggestions };

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                certifications: { include: { skills: true } },
                availabilities: true,
                availabilityExceptions: true,
                shifts: { include: { shift: true } },
            },
        });
        if (!user)
            return { allowed: false, errors: ["User not found"], suggestions };

        // Double booking & rest check
        for (const a of user.shifts) {
            const s2 = a.shift;
            if (s2.startTime < shift.endTime && shift.startTime < s2.endTime)
                errors.push("User is already booked in an overlapping shift.");

            const restBefore =
                (shift.startTime.getTime() - s2.endTime.getTime()) / 3600000;
            const restAfter =
                (s2.startTime.getTime() - shift.endTime.getTime()) / 3600000;
            if (restBefore > 0 && restBefore < MIN_REST_HOURS)
                errors.push(
                    `Less than ${MIN_REST_HOURS} hours rest before this shift.`,
                );
            if (restAfter > 0 && restAfter < MIN_REST_HOURS)
                errors.push(
                    `Less than ${MIN_REST_HOURS} hours rest after this shift.`,
                );
        }

        // Skill & certification check
        const userSkills = new Set(
            user.certifications.flatMap((c) => c.skills.map((s) => s.id)),
        );
        for (const r of shift.requirements)
            if (!userSkills.has(r.skillId))
                errors.push(`Missing skill: ${r.skill.name}`);
        if (!user.certifications.some((c) => c.locationId === shift.locationId))
            errors.push("User is not certified at this location.");

        // Availability
        const dayOfWeek = shift.date.getDay();
        const tz = shift.location.timezone;
        const avaMatch = user.availabilities.filter(
            (a) => a.dayOfWeek === dayOfWeek,
        );
        if (!avaMatch.length) errors.push("No availability for this day.");
        else {
            const st = parseInt(formatInTimeZone(shift.startTime, tz, "H"));
            const et = parseInt(formatInTimeZone(shift.endTime, tz, "H"));
            if (!avaMatch.some((a) => st >= a.startHour && et <= a.endHour))
                errors.push("Availability does not cover shift time.");
        }

        // Suggestions (scalable: filter only qualified alternatives)
        const requiredSkillIds = shift.requirements.map((r) => r.skillId);
        const qualified = await prisma.user.findMany({
            where: {
                role: "STAFF",
                certifications: {
                    some: {
                        skills: { some: { id: { in: requiredSkillIds } } },
                    },
                },
            },
            select: { id: true, certifications: { include: { skills: true } } },
        });
        for (const alt of qualified) {
            const altSkills = new Set(
                alt.certifications.flatMap((c) => c.skills.map((s) => s.id)),
            );
            if (requiredSkillIds.every((r) => altSkills.has(r)))
                suggestions.push({
                    userId: alt.id,
                    reason: "Qualified alternative",
                });
        }

        return { allowed: errors.length === 0, errors, suggestions };
    } catch (err) {
        console.error("runAssignmentConstraints error:", err);
        return { allowed: false, errors: ["Internal error"], suggestions: [] };
    }
}

/** Create shift with transaction & error handling */
export async function createShift(
    userId: string,
    locationId: string,
    date: Date,
    startTime: Date,
    endTime: Date,
    requirements: { skillId: string; quantity: number }[],
    isPremium: boolean,
) {
    try {
        if (endTime <= startTime)
            throw new Error("Shift end time must be after start time");

        const overlapping = await prisma.shift.findFirst({
            where: {
                locationId,
                date,
                OR: [
                    {
                        startTime: { lte: endTime },
                        endTime: { gte: startTime },
                    },
                ],
            },
        });
        if (overlapping)
            throw new Error(
                "Shift overlaps with an existing shift at this location",
            );

        const skillIds = requirements.map((r) => r.skillId);
        const validSkills = await prisma.skill.findMany({
            where: { id: { in: skillIds } },
            select: { id: true },
        });
        const validSet = new Set(validSkills.map((s) => s.id));
        for (const r of requirements)
            if (!validSet.has(r.skillId))
                throw new Error(`Invalid skill ID: ${r.skillId}`);

        const shift = await prisma.$transaction(async (tx) => {
            const s = await tx.shift.create({
                data: {
                    locationId,
                    date,
                    startTime,
                    endTime,
                    isPremium,
                    status: "DRAFT",
                    requirements: { create: requirements },
                },
                include: { requirements: { include: { skill: true } } },
            });
            await tx.auditLog.create({
                data: {
                    entityType: "Shift",
                    entityId: s.id,
                    action: "CREATE",
                    before: Prisma.JsonNull,
                    after: s,
                    performedById: userId,
                },
            });
            revalidatePath("/schedule");
            return s;
        });

        return { success: true, shift };
    } catch (err) {
        console.error("createShift error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/** Assign staff to shift */
export async function assignStaffToShift(
    userId: string,
    shiftId: string,
    staffId: string,
    overrideReason?: string,
) {
    try {
        const check = await runAssignmentConstraints(shiftId, staffId);
        if (!check.allowed && !overrideReason)
            return {
                success: false,
                errors: check.errors,
                suggestions: check.suggestions,
            };

        const assignment = await prisma.$transaction(async (tx) => {
            const asg = await tx.shiftAssignment.create({
                data: { shiftId, userId: staffId },
            });
            const after = await tx.shift.findUnique({
                where: { id: shiftId },
                include: { assignments: true },
            });
            await tx.auditLog.create({
                data: {
                    entityType: "ShiftAssignment",
                    entityId: asg.id,
                    action: "ASSIGN",
                    before: Prisma.JsonNull,
                    after: after ?? Prisma.JsonNull,
                    performedById: userId,
                },
            });
            revalidatePath("/schedule");
            return after;
        });

        return { success: true, shift: assignment };
    } catch (err) {
        console.error("assignStaffToShift error:", err);
        return { success: false, errors: ["Internal error"], suggestions: [] };
    }
}

/** Publish week schedule */
export async function publishWeekSchedule(
    userId: string,
    weekStart: Date,
    locationIds: string[],
) {
    try {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        // Include location info for human-readable toast
        const shifts = await prisma.shift.findMany({
            where: {
                date: { gte: weekStart, lt: weekEnd },
                locationId: { in: locationIds },
            },
            include: { location: true },
        });

        const now = new Date();
        const published: string[] = [];
        const blocked: { id: string; reason: string; description: string }[] =
            [];

        await prisma.$transaction(async (tx) => {
            for (const shift of shifts) {
                let alreadyHandled = false;

                if (
                    shift.startTime.getTime() - now.getTime() <
                    PUBLISH_CUTOFF_HOURS * 3600000
                ) {
                    blocked.push({
                        id: shift.id,
                        reason: "Within 48h cutoff",
                        description: `${shift.location.name} ${format(shift.startTime, "MMM d h:mm a")}`,
                    });
                    alreadyHandled = true;
                }

                if (!alreadyHandled) {
                    const updated = await tx.shift.update({
                        where: { id: shift.id },
                        data: { status: "PUBLISHED" },
                    });
                    published.push(updated.id);

                    await tx.auditLog.create({
                        data: {
                            entityType: "Shift",
                            entityId: updated.id,
                            action: "PUBLISH",
                            before: shift,
                            after: updated,
                            performedById: userId,
                        },
                    });
                }
            }
        });

        revalidatePath("/schedule");

        return { published, blocked };
    } catch (err) {
        console.error("publishWeekSchedule error:", err);
        return { published: [], blocked: [], error: (err as Error).message };
    }
}

/** Get shift details */
export async function getShiftDetails(
    shiftId: string,
): Promise<ShiftDetailFrontend | null> {
    try {
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: {
                location: true,
                assignments: { include: { user: true } },
                requirements: { include: { skill: true } },
                swapRequests: { include: { fromUser: true, toUser: true } },
                dropRequests: { include: { offeredBy: true, claimedBy: true } },
            },
        });
        if (!shift) return null;

        return {
            id: shift.id,
            date: shift.date.toISOString(),
            startTime: shift.startTime.toISOString(),
            endTime: shift.endTime.toISOString(),
            isPremium: shift.isPremium,
            status: shift.status,
            location: {
                id: shift.location.id,
                name: shift.location.name,
                timezone: shift.location.timezone,
            },
            assignments: shift.assignments.map((a) => ({
                id: a.id,
                user: mapUser(a.user)!,
            })),
            requirements: shift.requirements.map((r) => ({
                id: r.id,
                quantity: r.quantity,
                skill: { id: r.skill.id, name: r.skill.name },
            })),
            swapRequests: shift.swapRequests.map((s) => ({
                id: s.id,
                status: s.status,
                fromUser: mapUser(s.fromUser),
                toUser: mapUser(s.toUser),
            })),
            dropRequests: shift.dropRequests.map((d) => ({
                id: d.id,
                status: d.status,
                offeredBy: mapUser(d.offeredBy)!,
                claimedBy: mapUser(d.claimedBy),
            })),
        };
    } catch (err) {
        console.error("getShiftDetails error:", err);
        return null;
    }
}

/** Get week shifts */
export async function getWeekShifts(
    weekStart: Date,
    locationIds: string[],
): Promise<WeekShiftFrontend[]> {
    try {
        if (!weekStart || !locationIds.length) return [];
        const startOfWeek = new Date(weekStart);
        startOfWeek.setUTCHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);

        const shifts = await prisma.shift.findMany({
            where: {
                date: { gte: startOfWeek, lt: endOfWeek },
                locationId: { in: locationIds },
            },
            select: {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
                status: true,
                isPremium: true,
                location: { select: { id: true, name: true, timezone: true } },
                assignments: { select: { id: true, userId: true } },
            },
            orderBy: { startTime: "asc" },
        });

        return shifts.map((s) => ({
            id: s.id,
            date: s.date.toISOString(),
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            status: s.status,
            isPremium: s.isPremium,
            location: {
                id: s.location.id,
                name: s.location.name,
                timezone: s.location.timezone,
            },
            assignments: s.assignments.map((a) => ({
                id: a.id,
                userId: a.userId,
            })),
        }));
    } catch (err) {
        console.error("getWeekShifts error:", err);
        return [];
    }
}
