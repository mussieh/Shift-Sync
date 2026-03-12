"use server";

import { prisma } from "@/lib/db/prisma";
import { format, formatInTimeZone } from "date-fns-tz";
import { Prisma } from "../../../generated/prisma/client";
import { isPremiumShift } from "../constants";
import { sendBroadcast } from "../supabase/sendBroadcast";
import { BroadcastType } from "@/types/BroadcastType";
import { getClientId } from "../utils/clientId";

/** Constants */
const MIN_REST_HOURS = 10;
const PUBLISH_CUTOFF_HOURS = 48;

export interface EligibleStaff {
    id: string;
    firstName: string;
    lastName: string;
    skills: { id: string; name: string }[];
}

export interface ShiftDetailFrontend {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    isPremium: boolean;
    status: string;
    location: { id: string; name: string; timezone: string };
    requirements: {
        id: string;
        quantity: number;
        skill: { id: string; name: string };
    }[];
    assignments: {
        id: string;
        user: {
            id: string;
            firstName: string;
            lastName: string;
            role: string;
            skills: { id: string; name: string }[];
        };
    }[];
    eligibleStaff: EligibleStaff[];
}

export interface ConstraintResult {
    allowed: boolean;
    errors: string[];
    warnings: { reason: string }[];
    suggestions: { userId: string; reason: string }[];
}

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

export interface UpcomingShift {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    location: { id: string; name: string };
}

/* -------------------------------------------------------------------------- */
/*                        INTERNAL: NOTIFY USERS                             */
/*                                                                            */
/* Mirrors the same helper in swaps.ts — honours inAppEnabled preference.   */
/* Must be called inside a $transaction block.                               */
/* -------------------------------------------------------------------------- */

async function notifyUsers(
    tx: Prisma.TransactionClient,
    userIds: string[],
    message: string,
): Promise<void> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return;

    const optedOut = await tx.notificationPreference.findMany({
        where: { userId: { in: unique }, inAppEnabled: false },
        select: { userId: true },
    });
    const optedOutSet = new Set(optedOut.map((p) => p.userId));
    const eligible = unique.filter((id) => !optedOutSet.has(id));
    if (!eligible.length) return;

    await tx.notification.createMany({
        data: eligible.map((userId) => ({ userId, message })),
    });
}

/* -------------------------------------------------------------------------- */
/*                        INTERNAL: GET LOCATION MANAGERS                    */
/* -------------------------------------------------------------------------- */

async function getLocationManagerIds(
    tx: Prisma.TransactionClient,
    locationId: string,
): Promise<string[]> {
    const location = await tx.location.findUnique({
        where: { id: locationId },
        include: { managers: { select: { id: true } } },
    });
    return location?.managers.map((m) => m.id) ?? [];
}

export interface BasicEligibilityResult {
    eligible: boolean;
    reasons?: string[];
}

export async function runBasicEligibility(
    shift: Prisma.ShiftGetPayload<{
        include: {
            location: true;
            requirements: true;
            assignments?: { select: { userId: true } };
        };
    }>,
    userId: string,
): Promise<BasicEligibilityResult> {
    try {
        if (!shift) {
            return { eligible: false, reasons: ["Shift not found"] };
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                certifications: {
                    include: { skills: { select: { id: true } } },
                },
                shifts: {
                    include: {
                        shift: {
                            select: {
                                startTime: true,
                                endTime: true,
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            return { eligible: false, reasons: ["User not found"] };
        }

        if (user.role !== "STAFF") {
            return { eligible: false, reasons: ["User is not staff"] };
        }

        const reasons: string[] = [];

        /* ------------------------------------------------------------------ */
        /* Already assigned                                                   */
        /* ------------------------------------------------------------------ */

        const alreadyAssigned = shift.assignments.some(
            (a) => a.userId === userId,
        );

        if (alreadyAssigned) {
            reasons.push("User already assigned to this shift");
        }

        /* ------------------------------------------------------------------ */
        /* Location certification                                             */
        /* ------------------------------------------------------------------ */

        const certifiedAtLocation = user.certifications.some(
            (c) => c.locationId === shift.location.id,
        );

        if (!certifiedAtLocation) {
            reasons.push("User not certified at this location");
        }

        /* ------------------------------------------------------------------ */
        /* Skill requirements                                                 */
        /* ------------------------------------------------------------------ */

        const requiredSkillIds = shift.requirements.map((r) => r.skillId);

        const userSkillIds = new Set(
            user.certifications.flatMap((c) => c.skills.map((s) => s.id)),
        );

        const missingSkills = requiredSkillIds.filter(
            (skillId) => !userSkillIds.has(skillId),
        );

        if (missingSkills.length > 0) {
            reasons.push("User missing required skill(s)");
        }

        /* ------------------------------------------------------------------ */
        /* Overlapping shifts + rest rules                                    */
        /* ------------------------------------------------------------------ */

        for (const assignment of user.shifts) {
            const otherShift = assignment.shift;

            const overlap =
                otherShift.startTime < shift.endTime &&
                shift.startTime < otherShift.endTime;

            if (overlap) {
                reasons.push("User has overlapping shift");
                break;
            }

            const restBefore =
                (shift.startTime.getTime() - otherShift.endTime.getTime()) /
                3600000;

            const restAfter =
                (otherShift.startTime.getTime() - shift.endTime.getTime()) /
                3600000;

            if (restBefore > 0 && restBefore < MIN_REST_HOURS) {
                reasons.push(
                    `Less than ${MIN_REST_HOURS} hours rest before shift`,
                );
            }

            if (restAfter > 0 && restAfter < MIN_REST_HOURS) {
                reasons.push(
                    `Less than ${MIN_REST_HOURS} hours rest after shift`,
                );
            }
        }

        return {
            eligible: reasons.length === 0,
            reasons: reasons.length ? reasons : undefined,
        };
    } catch (err) {
        console.error("runBasicEligibility error:", err);
        return {
            eligible: false,
            reasons: ["Internal eligibility check error"],
        };
    }
}

/* -------------------------------------------------------------------------- */
/*                         CONSTRAINT CHECKS                                  */
/* -------------------------------------------------------------------------- */

export async function runAssignmentConstraints(
    shiftId: string,
    userId: string,
): Promise<ConstraintResult> {
    const errors: string[] = [];
    const warnings: { reason: string }[] = [];
    const suggestions: { userId: string; reason: string }[] = [];

    const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
            location: true,
            requirements: { include: { skill: true } },
            assignments: true,
        },
    });

    if (!shift)
        return {
            allowed: false,
            errors: ["Shift not found"],
            warnings,
            suggestions,
        };

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
        return {
            allowed: false,
            errors: ["User not found"],
            warnings,
            suggestions,
        };

    /* ------------------------------------------------ */
    /* Double booking + rest rules                      */
    /* ------------------------------------------------ */

    for (const assignment of user.shifts) {
        const s = assignment.shift;

        if (s.startTime < shift.endTime && shift.startTime < s.endTime) {
            errors.push("User is already booked in an overlapping shift.");
        }

        const restBefore =
            (shift.startTime.getTime() - s.endTime.getTime()) / 3600000;

        const restAfter =
            (s.startTime.getTime() - shift.endTime.getTime()) / 3600000;

        if (restBefore > 0 && restBefore < MIN_REST_HOURS)
            errors.push(`Less than ${MIN_REST_HOURS} hours rest before shift.`);

        if (restAfter > 0 && restAfter < MIN_REST_HOURS)
            errors.push(`Less than ${MIN_REST_HOURS} hours rest after shift.`);
    }

    /* ------------------------------------------------ */
    /* Skill validation                                 */
    /* ------------------------------------------------ */

    const userSkills = new Set(
        user.certifications.flatMap((c) => c.skills.map((s) => s.id)),
    );

    for (const req of shift.requirements) {
        if (!userSkills.has(req.skillId))
            errors.push(`Missing required skill: ${req.skill.name}`);
    }

    /* ------------------------------------------------ */
    /* Location certification                           */
    /* ------------------------------------------------ */

    if (!user.certifications.some((c) => c.locationId === shift.locationId))
        errors.push("User is not certified at this location.");

    /* ------------------------------------------------ */
    /* Availability exceptions                          */
    /* ------------------------------------------------ */

    const shiftDateString = shift.date.toISOString().split("T")[0];

    const exception = user.availabilityExceptions.find(
        (e) => e.date.toISOString().split("T")[0] === shiftDateString,
    );

    if (exception?.type === "UNAVAILABLE")
        errors.push("User marked unavailable for this date.");

    /* ------------------------------------------------ */
    /* Weekly availability check (DST-aware)            */
    /* ------------------------------------------------ */

    const tz = shift.location.timezone;

    // Compute actual local shift start/end in the location's timezone
    const shiftStartLocal = new Date(
        formatInTimeZone(shift.startTime, tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    );
    const shiftEndLocal = new Date(
        formatInTimeZone(shift.endTime, tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    );

    const dayOfWeek = shiftStartLocal.getDay();

    const availability = user.availabilities.filter(
        (a) => a.dayOfWeek === dayOfWeek,
    );

    if (!availability.length) {
        errors.push("User has no availability for this day.");
    } else {
        const fits = availability.some((a) => {
            // Compute availability start/end in local time for this shift
            const availabilityStart = new Date(shiftStartLocal);
            availabilityStart.setHours(a.startHour, 0, 0, 0);

            const availabilityEnd = new Date(shiftStartLocal);
            availabilityEnd.setHours(a.endHour, 0, 0, 0);

            if (shiftEndLocal < shiftStartLocal) {
                // overnight shift
                return (
                    shiftStartLocal >= availabilityStart ||
                    shiftEndLocal <= availabilityEnd
                );
            }

            return (
                shiftStartLocal >= availabilityStart &&
                shiftEndLocal <= availabilityEnd
            );
        });

        if (!fits) errors.push("Shift is outside user availability.");
    }

    /* ------------------------------------------------ */
    /* Suggest alternatives                             */
    /* ------------------------------------------------ */

    const requiredSkills = shift.requirements.map((r) => r.skillId);

    const candidates = await prisma.user.findMany({
        where: {
            role: "STAFF",
            certifications: {
                some: {
                    locationId: shift.locationId,
                    skills: { some: { id: { in: requiredSkills } } },
                },
            },
        },
        select: { id: true },
    });

    for (const candidate of candidates) {
        const check = await runBasicEligibility(shift, candidate.id);

        if (check)
            suggestions.push({
                userId: candidate.id,
                reason: "Qualified and available",
            });

        if (suggestions.length >= 5) break;
    }

    return {
        allowed: errors.length === 0,
        errors,
        warnings,
        suggestions,
    };
}

/* -------------------------------------------------------------------------- */
/*                              CREATE SHIFT                                  */
/* -------------------------------------------------------------------------- */

export async function createShift(
    userId: string,
    locationId: string,
    date: Date,
    startTime: Date,
    endTime: Date,
    requirements: { skillId: string; quantity: number }[],
) {
    try {
        if (endTime <= startTime)
            throw new Error("Shift end time must be after start time");

        const isPremium = isPremiumShift(startTime, endTime);

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

            return s;
        });

        sendBroadcast(BroadcastType.SHIFT_CREATED, getClientId());
        return { success: true, shift };
    } catch (err) {
        console.error("createShift error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           ASSIGN STAFF TO SHIFT                            */
/*                                                                            */
/* Notifies:                                                                  */
/*   • The assigned staff member — "You have been assigned to a shift"       */
/*   • Location managers — awareness of the new assignment                   */
/* -------------------------------------------------------------------------- */

export type AssignStaffResult =
    | { success: true; shift: ShiftDetailFrontend }
    | {
          success: false;
          errors: string[];
          suggestions: { userId: string; reason: string }[];
      };

export async function assignStaffToShift(
    userId: string,
    shiftId: string,
    staffId: string,
    overrideReason?: string,
    cutoffHours = 48,
): Promise<AssignStaffResult> {
    try {
        const shiftBeforeAssign = await prisma.shift.findUnique({
            where: { id: shiftId },
        });
        if (!shiftBeforeAssign) throw new Error("Shift not found");

        const now = new Date();
        const shiftStart = new Date(shiftBeforeAssign.startTime);
        const cutoffDate = new Date(
            shiftStart.getTime() - cutoffHours * 60 * 60 * 1000,
        );
        if (now > cutoffDate)
            throw new Error(
                `Cannot assign staff less than ${cutoffHours} hours before shift start`,
            );

        const check = await runAssignmentConstraints(shiftId, staffId);
        if (!check.allowed && !overrideReason)
            return {
                success: false,
                errors: check.errors ?? [
                    "Assignment not allowed by constraints",
                ],
                suggestions: check.suggestions ?? [],
            };
        if (!check.allowed && overrideReason?.trim() === "")
            return {
                success: false,
                errors: ["Override reason is required to bypass constraints"],
                suggestions: [],
            };

        const shift = await prisma.$transaction(async (tx) => {
            const assignment = await tx.shiftAssignment.create({
                data: { shiftId, userId: staffId },
            });

            const shiftData = await tx.shift.findUnique({
                where: { id: shiftId },
                include: {
                    location: true,
                    assignments: {
                        include: {
                            user: {
                                include: {
                                    certifications: {
                                        include: { skills: true },
                                    },
                                },
                            },
                        },
                    },
                    requirements: { include: { skill: true } },
                },
            });
            if (!shiftData) throw new Error("Shift not found after assignment");

            await tx.auditLog.create({
                data: {
                    entityType: "ShiftAssignment",
                    entityId: assignment.id,
                    action: "ASSIGN",
                    before: Prisma.JsonNull,
                    after: shiftData,
                    performedById: userId,
                },
            });

            const shiftLabel = `${shiftData.location.name} on ${shiftData.date.toDateString()} (${format(shiftData.startTime, "h:mm a")} – ${format(shiftData.endTime, "h:mm a")})`;

            // ✅ Notify the assigned staff member
            await notifyUsers(
                tx,
                [staffId],
                `You have been assigned to a shift: ${shiftLabel}.`,
            );

            // ✅ Notify location managers about the new assignment
            const managerIds = await getLocationManagerIds(
                tx,
                shiftData.locationId,
            );
            // Exclude the manager performing the action to avoid self-notification
            const otherManagers = managerIds.filter((id) => id !== userId);
            if (otherManagers.length) {
                const staffMember = shiftData.assignments.find(
                    (a) => a.userId === staffId,
                )?.user;
                const staffName = staffMember
                    ? `${staffMember.firstName} ${staffMember.lastName}`
                    : "A staff member";
                await notifyUsers(
                    tx,
                    otherManagers,
                    `${staffName} has been assigned to ${shiftLabel}.`,
                );
            }

            return shiftData;
        });

        const assignedIds = shift.assignments.map((a) => a.user.id);
        const eligibleStaffRaw = await prisma.user.findMany({
            where: {
                role: "STAFF",
                certifications: { some: { locationId: shift.locationId } },
                id: { notIn: assignedIds },
            },
            include: { certifications: { include: { skills: true } } },
        });

        const eligibleStaff = eligibleStaffRaw.map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            skills: Array.from(
                new Map(
                    u.certifications.flatMap((c) =>
                        c.skills.map((s) => [s.id, s] as const),
                    ),
                ).values(),
            ),
        }));

        const transformed: ShiftDetailFrontend = {
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
            eligibleStaff,
            assignments: shift.assignments.map((a) => ({
                id: a.id,
                user: {
                    id: a.user.id,
                    firstName: a.user.firstName,
                    lastName: a.user.lastName,
                    role: a.user.role as "ADMIN" | "MANAGER" | "STAFF",
                    skills: a.user.certifications
                        .flatMap((c) => c.skills)
                        .map((s) => ({ id: s.id, name: s.name })),
                },
            })),
            requirements: shift.requirements.map((r) => ({
                id: r.id,
                quantity: r.quantity,
                skill: { id: r.skill.id, name: r.skill.name },
            })),
        };

        sendBroadcast(BroadcastType.ASSIGNMENT_ADDED, getClientId());
        return { success: true, shift: transformed };
    } catch (err) {
        console.error("assignStaffToShift error:", err);
        return {
            success: false,
            errors: [(err as Error).message ?? "Internal server error"],
            suggestions: [],
        };
    }
}

/* -------------------------------------------------------------------------- */
/*                           REMOVE STAFF FROM SHIFT                          */
/*                                                                            */
/* Notifies:                                                                  */
/*   • The removed staff member — "You have been removed from a shift"       */
/* -------------------------------------------------------------------------- */

export async function removeStaffFromShift(
    userId: string,
    assignmentId: string,
    cutoffHours = 48,
) {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const assignment = await tx.shiftAssignment.findUnique({
                where: { id: assignmentId },
                include: {
                    shift: { include: { location: true } },
                    user: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                },
            });
            if (!assignment) throw new Error("Assignment not found");

            const now = new Date();
            const shiftStart = new Date(assignment.shift.startTime);
            const cutoffDate = new Date(
                shiftStart.getTime() - cutoffHours * 60 * 60 * 1000,
            );
            if (now > cutoffDate)
                throw new Error(
                    `Cannot remove staff less than ${cutoffHours} hours before shift start`,
                );

            await tx.shiftAssignment.delete({ where: { id: assignmentId } });

            const after = await tx.shift.findUnique({
                where: { id: assignment.shiftId },
                include: { assignments: true },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "ShiftAssignment",
                    entityId: assignmentId,
                    action: "REMOVE",
                    before: assignment,
                    after: after ?? Prisma.JsonNull,
                    performedById: userId,
                },
            });

            const shiftLabel = `${assignment.shift.location.name} on ${assignment.shift.date.toDateString()} (${format(assignment.shift.startTime, "h:mm a")} – ${format(assignment.shift.endTime, "h:mm a")})`;

            // ✅ Notify the removed staff member (unless they removed themselves)
            if (assignment.user.id !== userId) {
                await notifyUsers(
                    tx,
                    [assignment.user.id],
                    `You have been removed from the shift: ${shiftLabel}.`,
                );
            }

            return after;
        });

        sendBroadcast(BroadcastType.ASSIGNMENT_REMOVED, getClientId());
        return { success: true, shift: result };
    } catch (err) {
        console.error("removeStaffFromShift error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           PUBLISH WEEK SCHEDULE                            */
/*                                                                            */
/* Notifies:                                                                  */
/*   • All staff assigned to newly-published shifts — "Your schedule is live"*/
/* -------------------------------------------------------------------------- */

export async function publishWeekSchedule(
    userId: string,
    weekStart: Date,
    locationIds: string[],
) {
    try {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const shifts = await prisma.shift.findMany({
            where: {
                date: { gte: weekStart, lt: weekEnd },
                locationId: { in: locationIds },
            },
            include: {
                location: true,
                assignments: { select: { userId: true } },
            },
        });

        const now = new Date();
        const publishable: typeof shifts = [];
        const blocked: { id: string; reason: string; description: string }[] =
            [];

        for (const shift of shifts) {
            if (shift.status === "PUBLISHED") continue;
            if (
                shift.startTime.getTime() - now.getTime() <
                PUBLISH_CUTOFF_HOURS * 3600000
            ) {
                blocked.push({
                    id: shift.id,
                    reason: "Cannot publish within 48 hours of shift start",
                    description: `${shift.location.name} ${format(shift.startTime, "MMM d h:mm a")}`,
                });
            } else {
                publishable.push(shift);
            }
        }

        const published: { id: string; description: string }[] = [];

        await prisma.$transaction(async (tx) => {
            if (!publishable.length) return;

            await tx.shift.updateMany({
                where: { id: { in: publishable.map((s) => s.id) } },
                data: { status: "PUBLISHED" },
            });

            const auditLogs = publishable.map((shift) => ({
                entityType: "Shift",
                entityId: shift.id,
                action: "PUBLISH",
                before: shift,
                after: { ...shift, status: "PUBLISHED" },
                performedById: userId,
                createdAt: new Date(),
            }));
            await tx.auditLog.createMany({ data: auditLogs });

            published.push(
                ...publishable.map((s) => ({
                    id: s.id,
                    description: `${s.location.name} ${format(s.startTime, "MMM d h:mm a")}`,
                })),
            );

            // ✅ Notify each assigned staff member whose shift was just published
            // Group by staff member to send one notification per person covering
            // all their newly-published shifts in this batch
            const staffShiftMap = new Map<string, string[]>();
            for (const shift of publishable) {
                const label = `${shift.location.name} on ${shift.date.toDateString()} (${format(shift.startTime, "h:mm a")} – ${format(shift.endTime, "h:mm a")})`;
                for (const a of shift.assignments) {
                    if (!staffShiftMap.has(a.userId))
                        staffShiftMap.set(a.userId, []);
                    staffShiftMap.get(a.userId)!.push(label);
                }
            }

            for (const [staffId, shiftLabels] of staffShiftMap.entries()) {
                const shiftList = shiftLabels.join(", ");
                await notifyUsers(
                    tx,
                    [staffId],
                    shiftLabels.length === 1
                        ? `Your schedule has been published: ${shiftList}.`
                        : `Your schedule has been published. You are assigned to ${shiftLabels.length} shifts: ${shiftList}.`,
                );
            }
        });

        sendBroadcast(BroadcastType.SHIFT_PUBLISHED, getClientId());
        return { published, blocked };
    } catch (err) {
        console.error("publishWeekSchedule error:", err);
        return { published: [], blocked: [], error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           UPDATE SHIFT STATUS (single)                    */
/*                                                                            */
/* Notifies:                                                                  */
/*   • All assigned staff when a shift is published or unpublished            */
/* -------------------------------------------------------------------------- */

export async function updateShiftStatus(
    userId: string,
    shiftId: string,
    status: "DRAFT" | "PUBLISHED",
    cutoffHours = 48,
) {
    try {
        const now = new Date();

        const shift = await prisma.$transaction(async (tx) => {
            const before = await tx.shift.findUnique({
                where: { id: shiftId },
            });
            if (!before) throw new Error("Shift not found");

            const shiftStart = new Date(before.startTime);
            const cutoffDate = new Date(
                shiftStart.getTime() - cutoffHours * 60 * 60 * 1000,
            );
            if (status === "DRAFT" && now > cutoffDate)
                throw new Error(
                    `Cannot unpublish/edit this shift less than ${cutoffHours} hours before start`,
                );

            const updated = await tx.shift.update({
                where: { id: shiftId },
                data: { status },
                include: {
                    location: true,
                    assignments: {
                        include: {
                            user: {
                                include: {
                                    certifications: {
                                        include: { skills: true },
                                    },
                                },
                            },
                        },
                    },
                    requirements: { include: { skill: true } },
                },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "Shift",
                    entityId: shiftId,
                    action: status === "PUBLISHED" ? "PUBLISH" : "UNPUBLISH",
                    before,
                    after: updated,
                    performedById: userId,
                },
            });

            const assignedStaffIds = updated.assignments.map((a) => a.user.id);
            const shiftLabel = `${updated.location.name} on ${updated.date.toDateString()} (${format(updated.startTime, "h:mm a")} – ${format(updated.endTime, "h:mm a")})`;

            if (status === "PUBLISHED") {
                // ✅ Notify all assigned staff the shift is now live
                await notifyUsers(
                    tx,
                    assignedStaffIds,
                    `Your shift has been published: ${shiftLabel}.`,
                );
            } else {
                // ✅ Notify all assigned staff the shift was pulled back to draft
                await notifyUsers(
                    tx,
                    assignedStaffIds,
                    `A shift you were assigned to has been unpublished and is under review: ${shiftLabel}.`,
                );
            }

            return updated;
        });

        sendBroadcast(BroadcastType.SHIFT_UPDATED, getClientId());
        return { success: true, shift };
    } catch (err) {
        console.error("updateShiftStatus error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                        GET SHIFT DETAIL WITH ELIGIBLE                     */
/* -------------------------------------------------------------------------- */

export async function getShiftDetailWithEligible(
    shiftId: string,
): Promise<ShiftDetailFrontend | null> {
    const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
            location: true,
            requirements: { include: { skill: true } },
            assignments: {
                include: {
                    user: {
                        include: {
                            certifications: { include: { skills: true } },
                        },
                    },
                },
            },
        },
    });
    if (!shift) return null;

    const assignments = shift.assignments.map((a) => {
        const skillsMap = new Map<string, { id: string; name: string }>();
        a.user.certifications.forEach((cert) =>
            cert.skills.forEach((s) => skillsMap.set(s.id, s)),
        );
        return {
            id: a.id,
            user: {
                id: a.user.id,
                firstName: a.user.firstName,
                lastName: a.user.lastName,
                role: a.user.role,
                skills: Array.from(skillsMap.values()),
            },
        };
    });

    const assignedIds = assignments.map((a) => a.user.id);

    const staff = await prisma.user.findMany({
        where: {
            role: "STAFF",
            certifications: { some: { locationId: shift.location.id } },
            id: { notIn: assignedIds },
        },
        include: { certifications: { include: { skills: true } } },
    });

    const eligibleStaff: EligibleStaff[] = staff.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        skills: Array.from(
            new Map(
                u.certifications.flatMap((c) =>
                    c.skills.map((s) => [s.id, s] as const),
                ),
            ).values(),
        ),
    }));

    return {
        id: shift.id,
        date: shift.date.toISOString(),
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        isPremium: shift.isPremium,
        status: shift.status,
        location: shift.location,
        requirements: shift.requirements.map((r) => ({
            id: r.id,
            quantity: r.quantity,
            skill: r.skill,
        })),
        assignments,
        eligibleStaff,
    };
}

/* -------------------------------------------------------------------------- */
/*                           GET WEEK SHIFTS                                  */
/* -------------------------------------------------------------------------- */

export async function getWeekShifts(
    weekStart: Date,
    locationIds: string[],
    user: { id: string; role: "ADMIN" | "MANAGER" | "STAFF" },
): Promise<WeekShiftFrontend[]> {
    try {
        if (!weekStart) return [];

        const startOfWeek = new Date(weekStart);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const where: Prisma.ShiftWhereInput = {
            date: { gte: startOfWeek, lt: endOfWeek },
        };

        if (user.role === "STAFF") {
            where.assignments = { some: { userId: user.id } };
            where.status = "PUBLISHED";
        } else if (user.role === "MANAGER") {
            if (!locationIds.length) return [];
            where.locationId = { in: locationIds };
        }

        const shifts = await prisma.shift.findMany({
            where,
            select: {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
                status: true,
                isPremium: true,
                location: { select: { id: true, name: true, timezone: true } },
                assignments: {
                    select: {
                        id: true,
                        userId: true,
                        user: { select: { firstName: true, lastName: true } },
                    },
                },
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
                user: a.user
                    ? { firstName: a.user.firstName, lastName: a.user.lastName }
                    : undefined,
            })),
        }));
    } catch (err) {
        console.error("getWeekShifts error:", err);
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/*                        GET UPCOMING SHIFTS FOR USER                       */
/* -------------------------------------------------------------------------- */

export async function getUpcomingShiftsForUser(
    userId: string,
): Promise<UpcomingShift[]> {
    try {
        const now = new Date();

        const assignments = await prisma.shiftAssignment.findMany({
            where: {
                userId,
                shift: { startTime: { gte: now }, status: "PUBLISHED" },
            },
            select: {
                shift: {
                    select: {
                        id: true,
                        date: true,
                        startTime: true,
                        endTime: true,
                        location: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { shift: { startTime: "asc" } },
        });

        return assignments.map((a) => ({
            id: a.shift.id,
            date: a.shift.date.toISOString(),
            startTime: a.shift.startTime.toISOString(),
            endTime: a.shift.endTime.toISOString(),
            location: {
                id: a.shift.location.id,
                name: a.shift.location.name,
            },
        }));
    } catch (err) {
        console.error("getUpcomingShiftsForUser error:", err);
        return [];
    }
}
