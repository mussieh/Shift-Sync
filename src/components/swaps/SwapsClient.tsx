"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

import { Check, X, RefreshCw, ArrowDownToLine, MapPin } from "lucide-react";
import { ClipLoader } from "react-spinners";

import {
    approveSwapRequest,
    cancelSwapRequest,
    createSwapRequest,
    createDropRequest,
    claimDropRequest,
    cancelDropRequest,
    acceptSwapRequest,
    declineSwapRequest,
    rejectSwapRequest,
    getSwapPageData,
    getAvailableDrops,
    SwapPageData,
    DropPageData,
    getMyDropRequests,
} from "@/lib/actions/swaps";
import {
    getUpcomingShiftsForUser,
    UpcomingShift,
} from "@/lib/actions/schedule";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

type UserRole = "STAFF" | "MANAGER" | "ADMIN";

type CurrentUser = {
    id: string;
    role: UserRole;
};

type Props = {
    currentUser: CurrentUser;
    initialSwaps: SwapPageData[];
    initialMyShifts: UpcomingShift[];
    initialAvailableDrops: DropPageData[];
};

type ApproveSwapVariables = { managerId: string; swapRequestId: string };
type RejectSwapVariables = { managerId: string; swapRequestId: string };
type CancelSwapVariables = { userId: string; swapRequestId: string };

/* -------------------------------------------------------------------------- */
/*                            STATUS BADGE COLOURS                            */
/* -------------------------------------------------------------------------- */

const statusVariant = (
    status: string,
): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case "PENDING":
            return "secondary";
        case "ACCEPTED":
            return "outline";
        case "APPROVED":
            return "default";
        case "REJECTED":
        case "CANCELLED":
            return "destructive";
        default:
            return "outline";
    }
};

/* -------------------------------------------------------------------------- */
/*                                  COMPONENT                                 */
/* -------------------------------------------------------------------------- */

export default function SwapsClient({
    currentUser,
    initialSwaps,
    initialMyShifts,
    initialAvailableDrops,
}: Props) {
    const queryClient = useQueryClient();

    // Per-row loading state — prevents all buttons lighting up on a single click
    const [pendingShiftId, setPendingShiftId] = useState<string | null>(null);
    const [pendingDropShiftId, setPendingDropShiftId] = useState<string | null>(
        null,
    );
    const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
    const [pendingCancelDropId, setPendingCancelDropId] = useState<
        string | null
    >(null);
    const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
    const [pendingApproveId, setPendingApproveId] = useState<string | null>(
        null,
    );
    const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
    const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
    const [pendingDeclineId, setPendingDeclineId] = useState<string | null>(
        null,
    );

    /* ---------------------------------------------------------------------- */
    /*                                  QUERIES                               */
    /* ---------------------------------------------------------------------- */

    const { data: swapRequests = [], isLoading } = useQuery<SwapPageData[]>({
        queryKey: ["swapRequests"],
        queryFn: () => getSwapPageData(currentUser.id),
        initialData: initialSwaps,
    });

    const { data: myShifts = [] } = useQuery<UpcomingShift[]>({
        queryKey: ["myUpcomingShifts", currentUser.id],
        queryFn: () => getUpcomingShiftsForUser(currentUser.id),
        initialData: initialMyShifts,
        enabled: currentUser.role === "STAFF",
    });

    const { data: availableDrops = [] } = useQuery<DropPageData[]>({
        queryKey: ["availableDrops", currentUser.id],
        queryFn: () => getAvailableDrops(currentUser.id),
        initialData: initialAvailableDrops,
        enabled: currentUser.role === "STAFF",
    });

    const { data: myDrops = [] } = useQuery({
        queryKey: ["myDrops", currentUser.id],
        queryFn: () => getMyDropRequests(currentUser.id),
    });

    /* ---------------------------------------------------------------------- */
    /*                              DERIVED STATE                             */
    /* ---------------------------------------------------------------------- */

    const isStaff = currentUser.role === "STAFF";
    const isManager =
        currentUser.role === "MANAGER" || currentUser.role === "ADMIN";

    // Requests Staff A created
    const mySwapRequests = swapRequests.filter(
        (r) => r.fromUserId === currentUser.id,
    );

    // Requests where this user is Staff B and needs to respond
    const incomingSwapRequests = swapRequests.filter(
        (r) => r.toUserId === currentUser.id && r.status === "PENDING",
    );

    // Swaps fully accepted by both parties awaiting manager action
    const pendingManagerApproval = swapRequests.filter(
        (r) =>
            r.status === "ACCEPTED" || (r.status === "PENDING" && !r.toUserId),
    );

    const canCreateSwap =
        mySwapRequests.filter((r) => ["PENDING", "ACCEPTED"].includes(r.status))
            .length < 3;

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["swapRequests"] });
        queryClient.invalidateQueries({
            queryKey: ["myUpcomingShifts", currentUser.id],
        });
        queryClient.invalidateQueries({
            queryKey: ["availableDrops", currentUser.id],
        });
    };

    /* ---------------------------------------------------------------------- */
    /*                                MUTATIONS                               */
    /* ---------------------------------------------------------------------- */

    const createSwapMutation = useMutation({
        mutationFn: (shiftId: string) =>
            createSwapRequest(currentUser.id, shiftId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Swap request created");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingShiftId(null),
    });

    const createDropMutation = useMutation({
        mutationFn: (shiftId: string) =>
            createDropRequest(currentUser.id, shiftId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Shift offered for drop");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingDropShiftId(null),
    });

    const claimMutation = useMutation({
        mutationFn: (dropRequestId: string) =>
            claimDropRequest(currentUser.id, dropRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Shift claimed successfully");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingClaimId(null),
    });

    const acceptMutation = useMutation({
        mutationFn: (swapRequestId: string) =>
            acceptSwapRequest(currentUser.id, swapRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Swap request accepted — awaiting manager approval");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingAcceptId(null),
    });

    const declineMutation = useMutation({
        mutationFn: (swapRequestId: string) =>
            declineSwapRequest(currentUser.id, swapRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Swap request declined");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingDeclineId(null),
    });

    const cancelSwapMutation = useMutation({
        mutationFn: ({ userId, swapRequestId }: CancelSwapVariables) =>
            cancelSwapRequest(userId, swapRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Swap request cancelled");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingCancelId(null),
    });

    const cancelDropMutation = useMutation({
        mutationFn: (dropRequestId: string) =>
            cancelDropRequest(currentUser.id, dropRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Drop request cancelled");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingCancelDropId(null),
    });

    const approveMutation = useMutation({
        mutationFn: ({ managerId, swapRequestId }: ApproveSwapVariables) =>
            approveSwapRequest(managerId, swapRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Swap request approved");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingApproveId(null),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ managerId, swapRequestId }: RejectSwapVariables) =>
            rejectSwapRequest(managerId, swapRequestId),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error);
                return;
            }
            toast.success("Swap request rejected");
            invalidate();
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setPendingRejectId(null),
    });

    /* ---------------------------------------------------------------------- */
    /*                                   UI                                   */
    /* ---------------------------------------------------------------------- */

    if (isLoading) {
        return (
            <div className="p-8 flex justify-center">
                <ClipLoader size={24} />
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Swap & Drop Requests</h1>
                <p className="text-muted-foreground mt-1">
                    Manage shift swaps and coverage requests
                </p>
            </div>

            <Tabs defaultValue={isStaff ? "my-shifts" : "pending"}>
                <TabsList>
                    {isStaff && (
                        <TabsTrigger className="p-4" value="my-shifts">
                            My Shifts
                        </TabsTrigger>
                    )}
                    {isStaff && (
                        <TabsTrigger className="p-4" value="incoming">
                            Incoming
                            {incomingSwapRequests.length > 0 && (
                                <span className="ml-2 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5">
                                    {incomingSwapRequests.length}
                                </span>
                            )}
                        </TabsTrigger>
                    )}
                    {isStaff && (
                        <TabsTrigger className="p-4" value="my-requests">
                            My Requests
                        </TabsTrigger>
                    )}
                    {isStaff && (
                        <TabsTrigger className="p-4" value="pick-up">
                            Pick Up Shifts
                            {availableDrops.length > 0 && (
                                <span className="ml-2 bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5">
                                    {availableDrops.length}
                                </span>
                            )}
                        </TabsTrigger>
                    )}
                    {isManager && (
                        <TabsTrigger className="p-4" value="pending">
                            Pending Approvals
                            {pendingManagerApproval.length > 0 && (
                                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                                    {pendingManagerApproval.length}
                                </span>
                            )}
                        </TabsTrigger>
                    )}
                    {isManager && (
                        <TabsTrigger className="p-4" value="all">
                            All Requests
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* -------------------------------------------------------- */}
                {/* STAFF: MY SHIFTS — request swap or drop per shift         */}
                {/* -------------------------------------------------------- */}

                {isStaff && (
                    <TabsContent value="my-shifts" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>My Upcoming Shifts</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {!canCreateSwap && (
                                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm">
                                        ⚠️ You have reached the maximum of 3
                                        pending swap requests
                                    </div>
                                )}

                                {myShifts.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No upcoming shifts
                                    </p>
                                ) : (
                                    myShifts.map((shift) => {
                                        const hasPendingSwap =
                                            mySwapRequests.some(
                                                (r) =>
                                                    r.shiftId === shift.id &&
                                                    [
                                                        "PENDING",
                                                        "ACCEPTED",
                                                    ].includes(r.status),
                                            );
                                        const hasPendingDrop = myDrops.some(
                                            (d) => d.shiftId === shift.id,
                                        );
                                        const isSwapLoading =
                                            pendingShiftId === shift.id;
                                        const isDropLoading =
                                            pendingDropShiftId === shift.id;

                                        return (
                                            <div
                                                key={shift.id}
                                                className="flex items-center justify-between p-3 border rounded-lg"
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {format(
                                                            new Date(
                                                                shift.date,
                                                            ),
                                                            "EEE, MMM d",
                                                        )}{" "}
                                                        at {shift.location.name}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {format(
                                                            new Date(
                                                                shift.startTime,
                                                            ),
                                                            "h:mm a",
                                                        )}{" "}
                                                        –{" "}
                                                        {format(
                                                            new Date(
                                                                shift.endTime,
                                                            ),
                                                            "h:mm a",
                                                        )}
                                                    </p>
                                                </div>

                                                <div className="flex gap-2">
                                                    {hasPendingSwap ? (
                                                        <Badge variant="outline">
                                                            Swap Pending
                                                        </Badge>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={
                                                                !canCreateSwap ||
                                                                isSwapLoading
                                                            }
                                                            onClick={() => {
                                                                setPendingShiftId(
                                                                    shift.id,
                                                                );
                                                                createSwapMutation.mutate(
                                                                    shift.id,
                                                                );
                                                            }}
                                                        >
                                                            {isSwapLoading ? (
                                                                <ClipLoader
                                                                    size={14}
                                                                    color="#0E172B"
                                                                />
                                                            ) : (
                                                                <>
                                                                    <RefreshCw className="w-4 h-4 mr-2" />
                                                                    Request Swap
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}

                                                    {hasPendingDrop ? (
                                                        <Badge variant="outline">
                                                            Drop Pending
                                                        </Badge>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={
                                                                isDropLoading
                                                            }
                                                            onClick={() => {
                                                                setPendingDropShiftId(
                                                                    shift.id,
                                                                );
                                                                createDropMutation.mutate(
                                                                    shift.id,
                                                                );
                                                            }}
                                                        >
                                                            {isDropLoading ? (
                                                                <ClipLoader
                                                                    size={14}
                                                                    color="#0E172B"
                                                                />
                                                            ) : (
                                                                <>
                                                                    <ArrowDownToLine className="w-4 h-4 mr-2" />
                                                                    Drop Shift
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* -------------------------------------------------------- */}
                {/* STAFF: INCOMING — Staff B accepts or declines             */}
                {/* -------------------------------------------------------- */}

                {isStaff && (
                    <TabsContent value="incoming" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Incoming Swap Requests</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {incomingSwapRequests.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No incoming swap requests
                                    </p>
                                ) : (
                                    incomingSwapRequests.map((swap) => {
                                        const isAccepting =
                                            pendingAcceptId === swap.id;
                                        const isDeclining =
                                            pendingDeclineId === swap.id;

                                        return (
                                            <div
                                                key={swap.id}
                                                className="p-4 border rounded-lg space-y-3"
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {format(
                                                            new Date(
                                                                swap.shift.date,
                                                            ),
                                                            "EEE, MMM d",
                                                        )}{" "}
                                                        at{" "}
                                                        {
                                                            swap.shift.location
                                                                .name
                                                        }
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {format(
                                                            new Date(
                                                                swap.shift
                                                                    .startTime,
                                                            ),
                                                            "h:mm a",
                                                        )}{" "}
                                                        –{" "}
                                                        {format(
                                                            new Date(
                                                                swap.shift
                                                                    .endTime,
                                                            ),
                                                            "h:mm a",
                                                        )}
                                                    </p>
                                                    <p className="text-sm mt-1">
                                                        <span className="font-medium">
                                                            From:
                                                        </span>{" "}
                                                        {
                                                            swap.fromUser
                                                                .firstName
                                                        }{" "}
                                                        {swap.fromUser.lastName}
                                                    </p>
                                                </div>

                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        disabled={
                                                            isAccepting ||
                                                            isDeclining
                                                        }
                                                        onClick={() => {
                                                            setPendingAcceptId(
                                                                swap.id,
                                                            );
                                                            acceptMutation.mutate(
                                                                swap.id,
                                                            );
                                                        }}
                                                    >
                                                        {isAccepting ? (
                                                            <ClipLoader
                                                                size={14}
                                                                color="#fff"
                                                            />
                                                        ) : (
                                                            <>
                                                                <Check className="w-4 h-4 mr-2" />
                                                                Accept
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        disabled={
                                                            isDeclining ||
                                                            isAccepting
                                                        }
                                                        onClick={() => {
                                                            setPendingDeclineId(
                                                                swap.id,
                                                            );
                                                            declineMutation.mutate(
                                                                swap.id,
                                                            );
                                                        }}
                                                    >
                                                        {isDeclining ? (
                                                            <ClipLoader
                                                                size={14}
                                                                color="#fff"
                                                            />
                                                        ) : (
                                                            <>
                                                                <X className="w-4 h-4 mr-2" />
                                                                Decline
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* -------------------------------------------------------- */}
                {/* STAFF: MY REQUESTS — history + cancel pending             */}
                {/* -------------------------------------------------------- */}

                {isStaff && (
                    <TabsContent value="my-requests" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>My Swap Requests</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {mySwapRequests.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No swap requests yet
                                    </p>
                                ) : (
                                    mySwapRequests.map((swap) => {
                                        const isThisLoading =
                                            pendingCancelId === swap.id;

                                        return (
                                            <div
                                                key={swap.id}
                                                className="flex items-center justify-between p-3 border rounded-lg"
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {format(
                                                            new Date(
                                                                swap.shift.date,
                                                            ),
                                                            "EEE, MMM d",
                                                        )}{" "}
                                                        at{" "}
                                                        {
                                                            swap.shift.location
                                                                .name
                                                        }
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {format(
                                                            new Date(
                                                                swap.shift
                                                                    .startTime,
                                                            ),
                                                            "h:mm a",
                                                        )}{" "}
                                                        –{" "}
                                                        {format(
                                                            new Date(
                                                                swap.shift
                                                                    .endTime,
                                                            ),
                                                            "h:mm a",
                                                        )}
                                                    </p>
                                                    {swap.toUser ? (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Swap with:{" "}
                                                            {
                                                                swap.toUser
                                                                    .firstName
                                                            }{" "}
                                                            {
                                                                swap.toUser
                                                                    .lastName
                                                            }
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Open swap — awaiting
                                                            manager assignment
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex gap-2 items-center">
                                                    <Badge
                                                        variant={statusVariant(
                                                            swap.status,
                                                        )}
                                                    >
                                                        {swap.status}
                                                    </Badge>

                                                    {[
                                                        "PENDING",
                                                        "ACCEPTED",
                                                    ].includes(swap.status) && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={
                                                                isThisLoading
                                                            }
                                                            onClick={() => {
                                                                setPendingCancelId(
                                                                    swap.id,
                                                                );
                                                                cancelSwapMutation.mutate(
                                                                    {
                                                                        userId: currentUser.id,
                                                                        swapRequestId:
                                                                            swap.id,
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            {isThisLoading ? (
                                                                <ClipLoader
                                                                    size={14}
                                                                    color="#0E172B"
                                                                />
                                                            ) : (
                                                                <X className="w-4 h-4" />
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* -------------------------------------------------------- */}
                {/* STAFF: PICK UP SHIFTS — claim available drops             */}
                {/* -------------------------------------------------------- */}

                {isStaff && (
                    <TabsContent value="pick-up" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    Available Shifts to Pick Up
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {availableDrops.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No shifts available to pick up
                                    </p>
                                ) : (
                                    availableDrops.map((drop) => {
                                        const isThisLoading =
                                            pendingClaimId === drop.id;
                                        const requiredSkills =
                                            drop.shift.requirements.map(
                                                (r) => r.skill.name,
                                            );

                                        return (
                                            <div
                                                key={drop.id}
                                                className="p-4 border rounded-lg space-y-2"
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {format(
                                                            new Date(
                                                                drop.shift.date,
                                                            ),
                                                            "EEE, MMM d",
                                                        )}{" "}
                                                        at{" "}
                                                        {
                                                            drop.shift.location
                                                                .name
                                                        }
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {format(
                                                            new Date(
                                                                drop.shift
                                                                    .startTime,
                                                            ),
                                                            "h:mm a",
                                                        )}{" "}
                                                        –{" "}
                                                        {format(
                                                            new Date(
                                                                drop.shift
                                                                    .endTime,
                                                            ),
                                                            "h:mm a",
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        Offered by{" "}
                                                        {
                                                            drop.offeredBy
                                                                .firstName
                                                        }{" "}
                                                        {
                                                            drop.offeredBy
                                                                .lastName
                                                        }
                                                    </p>
                                                    {requiredSkills.length >
                                                        0 && (
                                                        <div className="flex gap-1 flex-wrap mt-1">
                                                            {requiredSkills.map(
                                                                (skill) => (
                                                                    <Badge
                                                                        key={
                                                                            skill
                                                                        }
                                                                        variant="secondary"
                                                                        className="text-xs"
                                                                    >
                                                                        {skill}
                                                                    </Badge>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-orange-600 mt-1">
                                                        Expires{" "}
                                                        {format(
                                                            new Date(
                                                                drop.expiresAt,
                                                            ),
                                                            "MMM d 'at' h:mm a",
                                                        )}
                                                    </p>
                                                </div>

                                                <Button
                                                    size="sm"
                                                    disabled={isThisLoading}
                                                    onClick={() => {
                                                        setPendingClaimId(
                                                            drop.id,
                                                        );
                                                        claimMutation.mutate(
                                                            drop.id,
                                                        );
                                                    }}
                                                >
                                                    {isThisLoading ? (
                                                        <ClipLoader
                                                            size={14}
                                                            color="#fff"
                                                        />
                                                    ) : (
                                                        <>
                                                            <Check className="w-4 h-4 mr-2" />
                                                            Pick Up Shift
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* -------------------------------------------------------- */}
                {/* MANAGER: PENDING APPROVALS                                */}
                {/* -------------------------------------------------------- */}

                {isManager && (
                    <TabsContent value="pending" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Pending Swap Requests</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {pendingManagerApproval.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No swap requests awaiting approval
                                    </p>
                                ) : (
                                    pendingManagerApproval.map((swap) => {
                                        const isApproving =
                                            pendingApproveId === swap.id;
                                        const isRejecting =
                                            pendingRejectId === swap.id;

                                        return (
                                            <div
                                                key={swap.id}
                                                className="p-4 border rounded-lg space-y-3"
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-medium">
                                                            {format(
                                                                new Date(
                                                                    swap.shift
                                                                        .date,
                                                                ),
                                                                "EEE, MMM d",
                                                            )}{" "}
                                                            at{" "}
                                                            {
                                                                swap.shift
                                                                    .location
                                                                    .name
                                                            }
                                                        </p>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs"
                                                        >
                                                            {swap.status}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {format(
                                                            new Date(
                                                                swap.shift
                                                                    .startTime,
                                                            ),
                                                            "h:mm a",
                                                        )}{" "}
                                                        –{" "}
                                                        {format(
                                                            new Date(
                                                                swap.shift
                                                                    .endTime,
                                                            ),
                                                            "h:mm a",
                                                        )}
                                                    </p>
                                                </div>

                                                <div className="text-sm space-y-0.5">
                                                    <p>
                                                        <span className="font-medium">
                                                            From:
                                                        </span>{" "}
                                                        {
                                                            swap.fromUser
                                                                .firstName
                                                        }{" "}
                                                        {swap.fromUser.lastName}
                                                    </p>
                                                    {swap.toUser ? (
                                                        <p>
                                                            <span className="font-medium">
                                                                To:
                                                            </span>{" "}
                                                            {
                                                                swap.toUser
                                                                    .firstName
                                                            }{" "}
                                                            {
                                                                swap.toUser
                                                                    .lastName
                                                            }
                                                        </p>
                                                    ) : (
                                                        <p className="text-muted-foreground italic">
                                                            Open swap — no
                                                            replacement assigned
                                                            yet
                                                        </p>
                                                    )}
                                                    <p className="text-muted-foreground text-xs mt-1">
                                                        Requested{" "}
                                                        {format(
                                                            new Date(
                                                                swap.requestedAt,
                                                            ),
                                                            "MMM d, yyyy",
                                                        )}
                                                    </p>
                                                </div>

                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        disabled={
                                                            isApproving ||
                                                            isRejecting ||
                                                            // Open swaps need a replacement assigned first
                                                            !swap.toUserId
                                                        }
                                                        onClick={() => {
                                                            setPendingApproveId(
                                                                swap.id,
                                                            );
                                                            approveMutation.mutate(
                                                                {
                                                                    managerId:
                                                                        currentUser.id,
                                                                    swapRequestId:
                                                                        swap.id,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        {isApproving ? (
                                                            <ClipLoader
                                                                size={14}
                                                                color="#fff"
                                                            />
                                                        ) : (
                                                            <>
                                                                <Check className="w-4 h-4 mr-2" />
                                                                Approve
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        disabled={
                                                            isRejecting ||
                                                            isApproving
                                                        }
                                                        onClick={() => {
                                                            setPendingRejectId(
                                                                swap.id,
                                                            );
                                                            rejectMutation.mutate(
                                                                {
                                                                    managerId:
                                                                        currentUser.id,
                                                                    swapRequestId:
                                                                        swap.id,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        {isRejecting ? (
                                                            <ClipLoader
                                                                size={14}
                                                                color="#fff"
                                                            />
                                                        ) : (
                                                            <>
                                                                <X className="w-4 h-4 mr-2" />
                                                                Reject
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* -------------------------------------------------------- */}
                {/* MANAGER: ALL REQUESTS                                     */}
                {/* -------------------------------------------------------- */}

                {isManager && (
                    <TabsContent value="all" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>All Swap Requests</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {swapRequests.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No swap requests
                                    </p>
                                ) : (
                                    swapRequests.map((swap) => (
                                        <div
                                            key={swap.id}
                                            className="flex items-center justify-between p-3 border rounded-lg"
                                        >
                                            <div>
                                                <p className="font-medium">
                                                    {format(
                                                        new Date(
                                                            swap.shift.date,
                                                        ),
                                                        "EEE, MMM d",
                                                    )}{" "}
                                                    at{" "}
                                                    {swap.shift.location.name}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {swap.fromUser.firstName}{" "}
                                                    {swap.fromUser.lastName}
                                                    {swap.toUser &&
                                                        ` → ${swap.toUser.firstName} ${swap.toUser.lastName}`}
                                                </p>
                                            </div>

                                            <Badge
                                                variant={statusVariant(
                                                    swap.status,
                                                )}
                                            >
                                                {swap.status}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
