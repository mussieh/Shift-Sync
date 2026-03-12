"use server";

import { prisma } from "@/lib/db/prisma";
import { sendBroadcast } from "../supabase/sendBroadcast";
import { BroadcastType } from "@/types/BroadcastType";
import { getClientId } from "../utils/clientId";

import {
    DropRequest,
    Prisma,
    SwapRequest,
    SwapStatus,
} from "../../../generated/prisma/client";

/* -------------------------------------------------------------------------- */
/*                              RESULT TYPES                                  */
/* -------------------------------------------------------------------------- */

export type SwapActionResult =
    | { success: true; swapRequest: SwapRequest }
    | { success: false; error: string };

export type DropActionResult =
    | { success: true; dropRequest: DropRequest }
    | { success: false; error: string };

/* -------------------------------------------------------------------------- */
/*                              PAGE DATA TYPES                               */
/* -------------------------------------------------------------------------- */

export type SwapPageData = Prisma.SwapRequestGetPayload<{
    include: {
        shift: { include: { location: true } };
        fromUser: { select: { id: true; firstName: true; lastName: true } };
        toUser: { select: { id: true; firstName: true; lastName: true } };
        approvedBy: { select: { id: true; firstName: true; lastName: true } };
    };
}>;

export type DropPageData = Prisma.DropRequestGetPayload<{
    include: {
        shift: {
            include: {
                location: true;
                requirements: { include: { skill: true } };
            };
        };
        offeredBy: { select: { id: true; firstName: true; lastName: true } };
        claimedBy: { select: { id: true; firstName: true; lastName: true } };
    };
}>;

/* -------------------------------------------------------------------------- */
/*                           INTERNAL: NOTIFY USERS                          */
/*                                                                            */
/* Creates Notification rows inside an existing transaction, honouring each  */
/* user's inAppEnabled preference. Always call inside a $transaction block.  */
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
/*                INTERNAL: ENFORCE COMBINED ACTIVE REQUEST LIMIT             */
/*                                                                            */
/* A user may have at most 3 active requests across BOTH swaps and drops.    */
/*                                                                            */
/* Swaps counted: PENDING + ACCEPTED                                         */
/* Drops counted: PENDING                                                     */
/* -------------------------------------------------------------------------- */

async function enforceCombinedRequestLimit(
    tx: Prisma.TransactionClient,
    userId: string,
): Promise<void> {
    const [swapCount, dropCount] = await Promise.all([
        tx.swapRequest.count({
            where: {
                fromUserId: userId,
                status: { in: [SwapStatus.PENDING, SwapStatus.ACCEPTED] },
            },
        }),
        tx.dropRequest.count({
            where: {
                userId,
                status: SwapStatus.PENDING,
            },
        }),
    ]);

    if (swapCount + dropCount >= 3) {
        throw new Error(
            "Maximum 3 active swap or drop requests allowed at once",
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                       INTERNAL: CANCEL SWAPS FOR SHIFT                    */
/*                                                                            */
/* Auto-cancels all PENDING/ACCEPTED swaps when a manager edits a shift.     */
/* Exported so schedule.ts updateShiftStatus can call it inside its tx.      */
/* -------------------------------------------------------------------------- */

export async function cancelPendingSwapsForShift(
    tx: Prisma.TransactionClient,
    shiftId: string,
    shiftLabel: string,
    performedById: string,
): Promise<void> {
    const affected = await tx.swapRequest.findMany({
        where: { shiftId, status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true, fromUserId: true, toUserId: true, status: true },
    });
    if (!affected.length) return;

    await tx.swapRequest.updateMany({
        where: { id: { in: affected.map((s) => s.id) } },
        data: { status: "CANCELLED" },
    });

    const userIds = [
        ...new Set(
            affected.flatMap(
                (s) => [s.fromUserId, s.toUserId].filter(Boolean) as string[],
            ),
        ),
    ];

    await notifyUsers(
        tx,
        userIds,
        `Your swap request for ${shiftLabel} was automatically cancelled because a manager changed the shift.`,
    );

    await tx.auditLog.createMany({
        data: affected.map((s) => ({
            entityType: "SwapRequest",
            entityId: s.id,
            action: "AUTO_CANCEL",
            before: s as Prisma.InputJsonValue,
            after: { ...s, status: "CANCELLED" } as Prisma.InputJsonValue,
            performedById,
            createdAt: new Date(),
        })),
    });
}

/* -------------------------------------------------------------------------- */
/*                           FETCH: SWAP PAGE DATA                           */
/* -------------------------------------------------------------------------- */

export async function getSwapPageData(userId: string): Promise<SwapPageData[]> {
    if (!userId) throw new Error("getSwapPageData: userId is required");

    try {
        return await prisma.swapRequest.findMany({
            orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
            include: {
                shift: { include: { location: true } },
                fromUser: {
                    select: { id: true, firstName: true, lastName: true },
                },
                toUser: {
                    select: { id: true, firstName: true, lastName: true },
                },
                approvedBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
    } catch (error) {
        console.error("getSwapPageData failed", { userId, error });
        throw new Error("Unable to load swap requests");
    }
}

/* -------------------------------------------------------------------------- */
/*                           FETCH: AVAILABLE DROPS                          */
/*                                                                            */
/* Returns PENDING, non-expired drops the viewer can claim (not their own,   */
/* not shifts they're already assigned to). Used for "Pick Up Shifts" tab.   */
/* -------------------------------------------------------------------------- */

export async function getAvailableDrops(
    viewerId: string,
): Promise<DropPageData[]> {
    if (!viewerId) throw new Error("getAvailableDrops: viewerId is required");

    try {
        return await prisma.dropRequest.findMany({
            where: {
                status: "PENDING",
                expiresAt: { gt: new Date() },
                userId: { not: viewerId },
                shift: { assignments: { none: { userId: viewerId } } },
            },
            orderBy: { expiresAt: "asc" },
            include: {
                shift: {
                    include: {
                        location: true,
                        requirements: { include: { skill: true } },
                    },
                },
                offeredBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
                claimedBy: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
        });
    } catch (error) {
        console.error("getAvailableDrops failed", { viewerId, error });
        throw new Error("Unable to load available shifts");
    }
}

export async function getMyDropRequests(
    userId: string,
): Promise<DropPageData[]> {
    if (!userId) throw new Error("getMyDropRequests: userId is required");

    try {
        return await prisma.dropRequest.findMany({
            where: {
                userId: userId,
                status: "PENDING",
                expiresAt: { gt: new Date() },
            },
            orderBy: { expiresAt: "asc" },
            include: {
                shift: {
                    include: {
                        location: true,
                        requirements: {
                            include: { skill: true },
                        },
                    },
                },
                offeredBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                claimedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    } catch (error) {
        console.error("getMyDropRequests failed", { userId, error });
        throw new Error("Unable to load your drop requests");
    }
}

/* -------------------------------------------------------------------------- */
/*                           CREATE SWAP REQUEST (Staff A)                   */
/*                                                                            */
/* Targeted: toUserId supplied → notifies Staff B to accept/decline.         */
/* Open:     toUserId omitted → manager will assign a replacement.           */
/*                                                                            */
/* The 3-pending cap includes ACCEPTED status so a user cannot bypass it by  */
/* having requests accepted before creating new ones.                        */
/* -------------------------------------------------------------------------- */

export async function createSwapRequest(
    userId: string,
    shiftId: string,
    targetUserId?: string,
): Promise<SwapActionResult> {
    const resolvedTargetId = targetUserId?.trim() || undefined;

    try {
        if (resolvedTargetId && resolvedTargetId === userId)
            throw new Error("Cannot swap with yourself");

        const swap = await prisma.$transaction(async (tx) => {
            const assignment = await tx.shiftAssignment.findUnique({
                where: { shiftId_userId: { shiftId, userId } },
            });
            if (!assignment)
                throw new Error("You are not assigned to this shift");

            if (resolvedTargetId) {
                const targetUser = await tx.user.findUnique({
                    where: { id: resolvedTargetId },
                });
                if (!targetUser) throw new Error("Target user not found");

                const targetAlreadyAssigned =
                    await tx.shiftAssignment.findUnique({
                        where: {
                            shiftId_userId: {
                                shiftId,
                                userId: resolvedTargetId,
                            },
                        },
                    });
                if (targetAlreadyAssigned)
                    throw new Error(
                        "Target user is already assigned to this shift",
                    );

                const duplicate = await tx.swapRequest.findFirst({
                    where: {
                        shiftId,
                        fromUserId: userId,
                        toUserId: resolvedTargetId,
                        status: { in: ["PENDING", "ACCEPTED"] },
                    },
                });
                if (duplicate)
                    throw new Error(
                        "A pending swap request for this shift and target already exists",
                    );
            } else {
                const duplicateOpen = await tx.swapRequest.findFirst({
                    where: {
                        shiftId,
                        fromUserId: userId,
                        toUserId: null,
                        status: "PENDING",
                    },
                });
                if (duplicateOpen)
                    throw new Error(
                        "You already have a pending open swap request for this shift",
                    );
            }

            await enforceCombinedRequestLimit(tx, userId);

            const swap = await tx.swapRequest.create({
                data: {
                    shiftId,
                    fromUserId: userId,
                    ...(resolvedTargetId ? { toUserId: resolvedTargetId } : {}),
                    status: "PENDING",
                },
                include: {
                    shift: { include: { location: true } },
                    fromUser: { select: { firstName: true, lastName: true } },
                },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "SwapRequest",
                    entityId: swap.id,
                    action: "CREATE",
                    before: Prisma.JsonNull,
                    after: swap as Prisma.InputJsonValue,
                    performedById: userId,
                },
            });

            if (resolvedTargetId) {
                const shiftLabel = `${swap.shift.location.name} on ${swap.shift.date.toDateString()}`;
                await notifyUsers(
                    tx,
                    [resolvedTargetId],
                    `${swap.fromUser.firstName} ${swap.fromUser.lastName} has requested to swap their shift with you (${shiftLabel}). Please accept or decline.`,
                );
            }

            return swap;
        });

        sendBroadcast(BroadcastType.SWAP_REQUEST_CREATED, getClientId());
        return { success: true, swapRequest: swap };
    } catch (err) {
        console.error("createSwapRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           ACCEPT SWAP REQUEST (Staff B)                   */
/*                                                                            */
/* Step 2 of the workflow. Moves PENDING → ACCEPTED, queuing it for manager  */
/* review. Notifies Staff A and all managers for the shift's location.       */
/* -------------------------------------------------------------------------- */

export async function acceptSwapRequest(
    staffBId: string,
    swapRequestId: string,
): Promise<SwapActionResult> {
    try {
        const swap = await prisma.$transaction(async (tx) => {
            const swap = await tx.swapRequest.findUnique({
                where: { id: swapRequestId },
                include: {
                    shift: {
                        include: {
                            location: {
                                include: { managers: { select: { id: true } } },
                            },
                        },
                    },
                    fromUser: { select: { firstName: true, lastName: true } },
                    toUser: { select: { firstName: true, lastName: true } },
                },
            });

            if (!swap) throw new Error("Swap request not found");
            if (swap.toUserId !== staffBId)
                throw new Error("You are not the target of this swap request");
            if (swap.status !== "PENDING")
                throw new Error("Swap request is no longer pending");

            // Race-condition guard: re-check Staff B isn't already on the shift
            const alreadyAssigned = await tx.shiftAssignment.findUnique({
                where: {
                    shiftId_userId: { shiftId: swap.shiftId, userId: staffBId },
                },
            });
            if (alreadyAssigned)
                throw new Error("You are already assigned to this shift");

            const updated = await tx.swapRequest.update({
                where: { id: swapRequestId },
                data: { status: "ACCEPTED" },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "SwapRequest",
                    entityId: swapRequestId,
                    action: "ACCEPT",
                    before: swap as Prisma.InputJsonValue,
                    after: updated as Prisma.InputJsonValue,
                    performedById: staffBId,
                },
            });

            const shiftLabel = `${swap.shift.location.name} on ${swap.shift.date.toDateString()}`;
            const staffBName = `${swap.toUser!.firstName} ${swap.toUser!.lastName}`;
            const managerIds = swap.shift.location.managers.map((m) => m.id);

            await notifyUsers(
                tx,
                [swap.fromUserId],
                `${staffBName} has accepted your swap request for ${shiftLabel}. Awaiting manager approval.`,
            );
            await notifyUsers(
                tx,
                managerIds,
                `A shift swap for ${shiftLabel} has been accepted by both parties and requires your approval.`,
            );

            return updated;
        });

        sendBroadcast(BroadcastType.SWAP_REQUEST_ACCEPTED, getClientId());
        return { success: true, swapRequest: swap };
    } catch (err) {
        console.error("acceptSwapRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           DECLINE SWAP REQUEST (Staff B)                  */
/* -------------------------------------------------------------------------- */

export async function declineSwapRequest(
    staffBId: string,
    swapRequestId: string,
): Promise<SwapActionResult> {
    try {
        const swap = await prisma.$transaction(async (tx) => {
            const swap = await tx.swapRequest.findUnique({
                where: { id: swapRequestId },
                include: {
                    shift: { include: { location: true } },
                    toUser: { select: { firstName: true, lastName: true } },
                },
            });

            if (!swap) throw new Error("Swap request not found");
            if (swap.toUserId !== staffBId)
                throw new Error("You are not the target of this swap request");
            if (swap.status !== "PENDING")
                throw new Error("Swap request is no longer pending");

            const updated = await tx.swapRequest.update({
                where: { id: swapRequestId },
                data: { status: "REJECTED" },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "SwapRequest",
                    entityId: swapRequestId,
                    action: "DECLINE",
                    before: swap as Prisma.InputJsonValue,
                    after: updated as Prisma.InputJsonValue,
                    performedById: staffBId,
                },
            });

            const shiftLabel = `${swap.shift.location.name} on ${swap.shift.date.toDateString()}`;
            const staffBName = `${swap.toUser!.firstName} ${swap.toUser!.lastName}`;

            await notifyUsers(
                tx,
                [swap.fromUserId],
                `${staffBName} has declined your swap request for ${shiftLabel}.`,
            );

            return updated;
        });

        sendBroadcast(BroadcastType.SWAP_REQUEST_REJECTED, getClientId());
        return { success: true, swapRequest: swap };
    } catch (err) {
        console.error("declineSwapRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           APPROVE SWAP (Manager)                          */
/*                                                                            */
/* Step 3. Accepts swaps in ACCEPTED status (targeted, Staff B confirmed) or  */
/* PENDING status with a toUserId already set (open swap, manager assigned). */
/* -------------------------------------------------------------------------- */

export async function approveSwapRequest(
    managerId: string,
    swapRequestId: string,
): Promise<SwapActionResult> {
    try {
        const swap = await prisma.$transaction(async (tx) => {
            const swap = await tx.swapRequest.findUnique({
                where: { id: swapRequestId },
                include: {
                    shift: {
                        include: {
                            assignments: true,
                            requirements: { include: { skill: true } },
                            location: true,
                        },
                    },
                    fromUser: { select: { firstName: true, lastName: true } },
                    toUser: { select: { firstName: true, lastName: true } },
                },
            });

            if (!swap) throw new Error("Swap request not found");

            // Targeted swap: must be ACCEPTED by Staff B first
            // Open swap with manager-assigned toUser: PENDING is acceptable
            const isReadyToApprove =
                (swap.status === "ACCEPTED" && !!swap.toUserId) ||
                (swap.status === "PENDING" && !!swap.toUserId);

            if (!isReadyToApprove) {
                if (!swap.toUserId)
                    throw new Error(
                        "Cannot approve an open swap — assign a replacement staff member first",
                    );
                throw new Error(
                    "Swap must be accepted by the target staff member before approval",
                );
            }

            const toUserAlreadyAssigned = swap.shift.assignments.some(
                (a) => a.userId === swap.toUserId,
            );
            if (toUserAlreadyAssigned)
                throw new Error(
                    "Target user is already assigned to this shift",
                );

            if (swap.shift.requirements.length > 0) {
                const toUser = await tx.user.findUnique({
                    where: { id: swap.toUserId! },
                    include: { certifications: { include: { skills: true } } },
                });
                if (!toUser) throw new Error("Target user not found");

                const toUserSkillIds = new Set(
                    toUser.certifications.flatMap((c) =>
                        c.skills.map((s) => s.id),
                    ),
                );
                for (const req of swap.shift.requirements) {
                    if (!toUserSkillIds.has(req.skillId))
                        throw new Error(
                            `Target user lacks the required skill: ${req.skill.name}`,
                        );
                }
            }

            const originalAssignment = swap.shift.assignments.find(
                (a) => a.userId === swap.fromUserId,
            );
            if (!originalAssignment)
                throw new Error("Original assignment not found");

            // Atomically replace — original stays until this exact point (req 5)
            await tx.shiftAssignment.delete({
                where: { id: originalAssignment.id },
            });
            const newAssignment = await tx.shiftAssignment.create({
                data: { shiftId: swap.shiftId, userId: swap.toUserId! },
            });

            const updated = await tx.swapRequest.update({
                where: { id: swapRequestId },
                data: {
                    status: "APPROVED",
                    approvedById: managerId,
                    approvedAt: new Date(),
                },
            });

            // Auto-reject other pending/accepted swaps from Staff A for same shift
            await tx.swapRequest.updateMany({
                where: {
                    shiftId: swap.shiftId,
                    fromUserId: swap.fromUserId,
                    status: { in: ["PENDING", "ACCEPTED"] },
                    id: { not: swapRequestId },
                },
                data: { status: "REJECTED" },
            });

            await tx.auditLog.createMany({
                data: [
                    {
                        entityType: "SwapRequest",
                        entityId: swapRequestId,
                        action: "APPROVE",
                        before: swap as Prisma.InputJsonValue,
                        after: updated as Prisma.InputJsonValue,
                        performedById: managerId,
                        createdAt: new Date(),
                    },
                    {
                        entityType: "ShiftAssignment",
                        entityId: originalAssignment.id,
                        action: "REMOVE",
                        before: originalAssignment as Prisma.InputJsonValue,
                        after: Prisma.JsonNull,
                        performedById: managerId,
                        createdAt: new Date(),
                    },
                    {
                        entityType: "ShiftAssignment",
                        entityId: newAssignment.id,
                        action: "ASSIGN",
                        before: Prisma.JsonNull,
                        after: newAssignment as Prisma.InputJsonValue,
                        performedById: managerId,
                        createdAt: new Date(),
                    },
                ],
            });

            const shiftLabel = `${swap.shift.location.name} on ${swap.shift.date.toDateString()}`;
            const toName = `${swap.toUser!.firstName} ${swap.toUser!.lastName}`;
            const fromName = `${swap.fromUser.firstName} ${swap.fromUser.lastName}`;

            await notifyUsers(
                tx,
                [swap.fromUserId, swap.toUserId!],
                `Your shift swap for ${shiftLabel} has been approved. ${toName} is now assigned in place of ${fromName}.`,
            );

            return updated;
        });

        sendBroadcast(BroadcastType.SWAP_REQUEST_APPROVED, getClientId());
        return { success: true, swapRequest: swap };
    } catch (err) {
        console.error("approveSwapRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           REJECT SWAP (Manager)                           */
/* -------------------------------------------------------------------------- */

export async function rejectSwapRequest(
    managerId: string,
    swapRequestId: string,
): Promise<SwapActionResult> {
    try {
        const swap = await prisma.$transaction(async (tx) => {
            const swap = await tx.swapRequest.findUnique({
                where: { id: swapRequestId },
                include: {
                    shift: { include: { location: true } },
                    fromUser: { select: { firstName: true, lastName: true } },
                    toUser: { select: { firstName: true, lastName: true } },
                },
            });

            if (!swap) throw new Error("Swap request not found");
            if (!["PENDING", "ACCEPTED"].includes(swap.status))
                throw new Error("Swap is already processed");

            const updated = await tx.swapRequest.update({
                where: { id: swapRequestId },
                data: {
                    status: "REJECTED",
                    approvedById: managerId,
                    approvedAt: new Date(),
                },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "SwapRequest",
                    entityId: swapRequestId,
                    action: "REJECT",
                    before: swap as Prisma.InputJsonValue,
                    after: updated as Prisma.InputJsonValue,
                    performedById: managerId,
                },
            });

            const shiftLabel = `${swap.shift.location.name} on ${swap.shift.date.toDateString()}`;
            const notifyIds = [swap.fromUserId, swap.toUserId].filter(
                Boolean,
            ) as string[];

            await notifyUsers(
                tx,
                notifyIds,
                `The shift swap for ${shiftLabel} has been rejected by a manager.`,
            );

            return updated;
        });

        sendBroadcast(BroadcastType.SWAP_REQUEST_REJECTED, getClientId());
        return { success: true, swapRequest: swap };
    } catch (err) {
        console.error("rejectSwapRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           CANCEL SWAP (Staff A)                           */
/* -------------------------------------------------------------------------- */

export async function cancelSwapRequest(
    userId: string,
    swapRequestId: string,
): Promise<SwapActionResult> {
    try {
        const swap = await prisma.$transaction(async (tx) => {
            const swap = await tx.swapRequest.findUnique({
                where: { id: swapRequestId },
                include: {
                    shift: { include: { location: true } },
                    toUser: { select: { firstName: true, lastName: true } },
                },
            });

            if (!swap) throw new Error("Swap request not found");
            if (swap.fromUserId !== userId) throw new Error("Not authorized");
            if (!["PENDING", "ACCEPTED"].includes(swap.status))
                throw new Error("Cannot cancel a processed swap");

            const updated = await tx.swapRequest.update({
                where: { id: swapRequestId },
                data: { status: "CANCELLED" },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "SwapRequest",
                    entityId: swapRequestId,
                    action: "CANCEL",
                    before: swap as Prisma.InputJsonValue,
                    after: updated as Prisma.InputJsonValue,
                    performedById: userId,
                },
            });

            // Notify Staff B if they had already accepted — their acceptance is now void
            if (swap.toUserId && swap.status === "ACCEPTED") {
                const shiftLabel = `${swap.shift.location.name} on ${swap.shift.date.toDateString()}`;
                await notifyUsers(
                    tx,
                    [swap.toUserId],
                    `The swap request you accepted for ${shiftLabel} has been cancelled by the requester.`,
                );
            }

            return updated;
        });

        sendBroadcast(BroadcastType.SWAP_REQUEST_CANCELLED, getClientId());
        return { success: true, swapRequest: swap };
    } catch (err) {
        console.error("cancelSwapRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           CREATE DROP REQUEST                              */
/*                                                                            */
/* expiresAt is always computed server-side as (shift.startTime − 24h).      */
/* The client passes no expiry — it cannot be spoofed.                       */
/* -------------------------------------------------------------------------- */

export async function createDropRequest(
    userId: string,
    shiftId: string,
): Promise<DropActionResult> {
    try {
        const drop = await prisma.$transaction(async (tx) => {
            const assignment = await tx.shiftAssignment.findUnique({
                where: { shiftId_userId: { shiftId, userId } },
            });
            if (!assignment)
                throw new Error("You are not assigned to this shift");

            const shift = await tx.shift.findUnique({
                where: { id: shiftId },
                include: { location: true },
            });
            if (!shift) throw new Error("Shift not found");

            // Server-enforced 24h expiry — cannot be overridden by caller
            const expiresAt = new Date(
                shift.startTime.getTime() - 24 * 60 * 60 * 1000,
            );
            if (new Date() >= expiresAt)
                throw new Error(
                    "Cannot create a drop request less than 24 hours before shift start",
                );

            const existingDrop = await tx.dropRequest.findFirst({
                where: { shiftId, userId, status: "PENDING" },
            });
            if (existingDrop)
                throw new Error(
                    "A pending drop request for this shift already exists",
                );

            await enforceCombinedRequestLimit(tx, userId);

            const drop = await tx.dropRequest.create({
                data: { shiftId, userId, expiresAt, status: "PENDING" },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "DropRequest",
                    entityId: drop.id,
                    action: "CREATE",
                    before: Prisma.JsonNull,
                    after: drop as Prisma.InputJsonValue,
                    performedById: userId,
                },
            });

            // Notify location managers a shift is available to be picked up
            const managers = await tx.user.findMany({
                where: { managedLocations: { some: { id: shift.locationId } } },
                select: { id: true },
            });
            const shiftLabel = `${shift.location.name} on ${shift.date.toDateString()}`;
            await notifyUsers(
                tx,
                managers.map((m) => m.id),
                `A shift is now available for pickup: ${shiftLabel}.`,
            );

            return drop;
        });

        sendBroadcast(BroadcastType.DROP_REQUEST_CREATED, getClientId());
        return { success: true, dropRequest: drop };
    } catch (err) {
        console.error("createDropRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           CLAIM DROP REQUEST                               */
/* -------------------------------------------------------------------------- */

export async function claimDropRequest(
    userId: string,
    dropRequestId: string,
): Promise<DropActionResult> {
    try {
        const drop = await prisma.$transaction(async (tx) => {
            const drop = await tx.dropRequest.findUnique({
                where: { id: dropRequestId },
                include: {
                    shift: { include: { location: true } },
                    offeredBy: { select: { firstName: true, lastName: true } },
                },
            });

            if (!drop) throw new Error("Drop request not found");
            if (drop.status !== "PENDING")
                throw new Error("Drop not available");
            if (drop.expiresAt < new Date())
                throw new Error("Drop request expired");
            if (drop.userId === userId)
                throw new Error("Cannot claim your own drop request");

            const alreadyAssigned = await tx.shiftAssignment.findUnique({
                where: { shiftId_userId: { shiftId: drop.shiftId, userId } },
            });
            if (alreadyAssigned)
                throw new Error("You are already assigned to this shift");

            const originalAssignment = await tx.shiftAssignment.findUnique({
                where: {
                    shiftId_userId: {
                        shiftId: drop.shiftId,
                        userId: drop.userId,
                    },
                },
            });
            if (!originalAssignment)
                throw new Error("Original assignment not found");

            // Atomically replace — original stays until this exact point (req 5)
            await tx.shiftAssignment.delete({
                where: { id: originalAssignment.id },
            });
            const newAssignment = await tx.shiftAssignment.create({
                data: { shiftId: drop.shiftId, userId },
            });

            const updated = await tx.dropRequest.update({
                where: { id: dropRequestId },
                data: { status: "APPROVED", claimedById: userId },
            });

            await tx.auditLog.createMany({
                data: [
                    {
                        entityType: "DropRequest",
                        entityId: dropRequestId,
                        action: "CLAIM",
                        before: drop as Prisma.InputJsonValue,
                        after: updated as Prisma.InputJsonValue,
                        performedById: userId,
                        createdAt: new Date(),
                    },
                    {
                        entityType: "ShiftAssignment",
                        entityId: originalAssignment.id,
                        action: "REMOVE",
                        before: originalAssignment as Prisma.InputJsonValue,
                        after: Prisma.JsonNull,
                        performedById: userId,
                        createdAt: new Date(),
                    },
                    {
                        entityType: "ShiftAssignment",
                        entityId: newAssignment.id,
                        action: "ASSIGN",
                        before: Prisma.JsonNull,
                        after: newAssignment as Prisma.InputJsonValue,
                        performedById: userId,
                        createdAt: new Date(),
                    },
                ],
            });

            const claimer = await tx.user.findUnique({
                where: { id: userId },
                select: { firstName: true, lastName: true },
            });
            const shiftLabel = `${drop.shift.location.name} on ${drop.shift.date.toDateString()}`;
            const claimerName = claimer
                ? `${claimer.firstName} ${claimer.lastName}`
                : "A staff member";

            await notifyUsers(
                tx,
                [drop.userId],
                `${claimerName} has picked up your dropped shift: ${shiftLabel}.`,
            );

            return updated;
        });

        sendBroadcast(BroadcastType.DROP_REQUEST_CLAIMED, getClientId());
        return { success: true, dropRequest: drop };
    } catch (err) {
        console.error("claimDropRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}

/* -------------------------------------------------------------------------- */
/*                           CANCEL DROP REQUEST                              */
/* -------------------------------------------------------------------------- */

export async function cancelDropRequest(
    userId: string,
    dropRequestId: string,
): Promise<DropActionResult> {
    try {
        const drop = await prisma.$transaction(async (tx) => {
            const drop = await tx.dropRequest.findUnique({
                where: { id: dropRequestId },
            });

            if (!drop) throw new Error("Drop request not found");
            if (drop.userId !== userId) throw new Error("Not authorized");
            if (drop.status !== "PENDING")
                throw new Error("Cannot cancel a processed drop request");

            const updated = await tx.dropRequest.update({
                where: { id: dropRequestId },
                data: { status: "CANCELLED" },
            });

            await tx.auditLog.create({
                data: {
                    entityType: "DropRequest",
                    entityId: dropRequestId,
                    action: "CANCEL",
                    before: drop as Prisma.InputJsonValue,
                    after: updated as Prisma.InputJsonValue,
                    performedById: userId,
                },
            });

            return updated;
        });

        sendBroadcast(BroadcastType.DROP_REQUEST_CANCELLED, getClientId());
        return { success: true, dropRequest: drop };
    } catch (err) {
        console.error("cancelDropRequest error:", err);
        return { success: false, error: (err as Error).message };
    }
}
