"use client";

import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ClipLoader } from "react-spinners";
import { Users, Check, X, AlertTriangle } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";
import { Alert, AlertDescription } from "../ui/alert";

import {
    useQuery,
    useMutation,
    useQueryClient,
    UseMutationResult,
} from "@tanstack/react-query";

import {
    ShiftDetailFrontend,
    ConstraintResult,
    assignStaffToShift,
    removeStaffFromShift,
    getShiftDetailWithEligible,
    AssignStaffResult,
    updateShiftStatus,
} from "@/lib/actions/schedule";
import { ShiftStatus } from "../../../generated/prisma/client";
import WhatIfPanel from "../analytics/WhatIfPanel";

interface Props {
    shiftId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    canManage: boolean;
    userRole: "ADMIN" | "MANAGER" | "STAFF";
}

interface RemoveStaffResult {
    success: boolean;
    error?: string;
}

export default function ShiftDetailDialog({
    shiftId,
    open,
    onOpenChange,
    userId,
    canManage,
    userRole,
}: Props) {
    const queryClient = useQueryClient();

    const [selectedUserId, setSelectedUserId] = useState("");

    const [overrideReason, setOverrideReason] = useState("");
    const [showOverride, setShowOverride] = useState(false);
    // FIX 2: track which specific assignment is being removed instead of using
    // the mutation's global isPending boolean
    const [removingId, setRemovingId] = useState<string | null>(null);

    const [constraintResult, setConstraintResult] = useState<ConstraintResult>({
        allowed: true,
        errors: [],
        warnings: [],
        suggestions: [],
    });

    const resetForm = useCallback(() => {
        setSelectedUserId("");
        setOverrideReason("");
        setShowOverride(false);
        setConstraintResult({
            allowed: true,
            errors: [],
            warnings: [],
            suggestions: [],
        });
    }, []);

    const shiftQuery = useQuery({
        queryKey: ["shiftDetail", shiftId],
        queryFn: () => getShiftDetailWithEligible(shiftId),
        enabled: open,
    });

    const assignMutation = useMutation<AssignStaffResult, unknown, string>({
        mutationFn: async (staffId) => {
            return assignStaffToShift(
                userId,
                shiftId,
                staffId,
                showOverride ? overrideReason : undefined,
            );
        },
        onSuccess: (res) => {
            if (!res.success) {
                setConstraintResult({
                    allowed: false,
                    errors: res.errors ?? [],
                    warnings: [],
                    suggestions: res.suggestions ?? [],
                });
                return;
            }
            toast.success("Staff assigned successfully");
            queryClient.setQueryData(["shiftDetail", shiftId], res.shift);
            queryClient.invalidateQueries({ queryKey: ["weekShifts"] });
            resetForm();
        },
        onError: (err) =>
            toast.error(
                err instanceof Error ? err.message : "Assignment failed",
            ),
    });

    const removeMutation = useMutation<RemoveStaffResult, Error, string>({
        mutationFn: (assignmentId: string) =>
            removeStaffFromShift(userId, assignmentId),
        onSuccess: (res) => {
            setRemovingId(null);
            if (!res.success) {
                toast.error(res.error ?? "Cannot remove staff");
                return;
            }
            toast.success("Staff removed");
            queryClient.invalidateQueries({
                queryKey: ["shiftDetail", shiftId],
            });
            queryClient.invalidateQueries({ queryKey: ["weekShifts"] });
        },
        onError: (err) => {
            setRemovingId(null);
            toast.error(err instanceof Error ? err.message : "Remove failed");
        },
    });

    const updateStatusMutation = useMutation<
        { success: boolean; error?: string },
        Error,
        ShiftStatus
    >({
        mutationFn: (status: "DRAFT" | "PUBLISHED") =>
            updateShiftStatus(userId, shiftId, status),
        onSuccess: (res, status) => {
            if (!res.success) {
                toast.error(res.error ?? "Failed to update shift");
                return;
            }
            toast.success(
                status === "PUBLISHED"
                    ? "Shift published"
                    : "Shift unpublished",
            );
            queryClient.invalidateQueries({
                queryKey: ["shiftDetail", shiftId],
            });
            queryClient.invalidateQueries({ queryKey: ["weekShifts"] });
        },
        onError: (err) =>
            toast.error(
                err instanceof Error ? err.message : "Status update failed",
            ),
    });

    const handleAssign = () => {
        if (!selectedUserId) {
            toast.error("Please select a staff member");
            return;
        }
        assignMutation.mutate(selectedUserId);
    };

    const handleRemove = (assignmentId: string) => {
        setRemovingId(assignmentId);
        removeMutation.mutate(assignmentId);
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">
                        Shift Details
                    </DialogTitle>
                </DialogHeader>

                {shiftQuery.isLoading && (
                    <div className="py-10 text-center">
                        <ClipLoader size={22} />
                    </div>
                )}

                {shiftQuery.isError && (
                    <p className="text-sm text-destructive py-6 text-center">
                        Failed to load shift details. Please try again.
                    </p>
                )}

                {shiftQuery.data && (
                    <ShiftDetailContent
                        shift={shiftQuery.data}
                        selectedUserId={selectedUserId}
                        setSelectedUserId={setSelectedUserId}
                        assignMutation={assignMutation}
                        removingId={removingId}
                        handleRemove={handleRemove}
                        constraintResult={constraintResult}
                        showOverride={showOverride}
                        setShowOverride={setShowOverride}
                        overrideReason={overrideReason}
                        setOverrideReason={setOverrideReason}
                        handleAssign={handleAssign}
                        canManage={canManage}
                        updateStatusMutation={updateStatusMutation}
                        userId={userId}
                        userRole={userRole}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

interface ShiftDetailContentProps {
    shift: ShiftDetailFrontend;
    selectedUserId: string;
    setSelectedUserId: (id: string) => void;
    assignMutation: UseMutationResult<AssignStaffResult, unknown, string>;
    removingId: string | null;
    handleRemove: (assignmentId: string) => void;
    constraintResult: ConstraintResult;
    showOverride: boolean;
    setShowOverride: (show: boolean) => void;
    overrideReason: string;
    setOverrideReason: (r: string) => void;
    handleAssign: () => void;
    canManage: boolean;
    updateStatusMutation: UseMutationResult<
        { success: boolean; error?: string },
        Error,
        ShiftStatus
    >;
    userId: string;
    userRole: "ADMIN" | "MANAGER" | "STAFF";
}

function ShiftDetailContent({
    shift,
    selectedUserId,
    setSelectedUserId,
    assignMutation,
    removingId,
    handleRemove,
    constraintResult,
    showOverride,
    setShowOverride,
    overrideReason,
    setOverrideReason,
    handleAssign,
    canManage,
    updateStatusMutation,
    userId,
    userRole,
}: ShiftDetailContentProps) {
    const assignedCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        shift.requirements.forEach((r) => {
            counts[r.id] = shift.assignments.filter((a) =>
                a.user.skills.some((s) => s.id === r.skill.id),
            ).length;
        });
        return counts;
    }, [shift]);

    const shiftStarted = new Date(shift.startTime) < new Date();
    const assignedIds = new Set(shift.assignments.map((a) => a.user.id));
    const availableStaff = shift.eligibleStaff.filter(
        (u) => !assignedIds.has(u.id),
    );

    return (
        <div className="space-y-4">
            <ShiftInfo shift={shift} />

            {/* Required Skills */}
            <div>
                <h4 className="font-medium mb-2">Required Skills</h4>
                <div className="flex flex-wrap gap-2">
                    {shift.requirements.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No skill requirements set
                        </p>
                    ) : (
                        shift.requirements.map((r) => (
                            <Badge
                                key={r.id}
                                variant={
                                    (assignedCounts[r.id] ?? 0) >= r.quantity
                                        ? "default"
                                        : "outline"
                                }
                            >
                                {r.skill.name}: {assignedCounts[r.id] ?? 0}/
                                {r.quantity}
                            </Badge>
                        ))
                    )}
                </div>
            </div>

            {/* Assigned Staff */}
            <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Assigned Staff ({shift.assignments.length})
                </h4>

                {shift.assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No staff assigned yet
                    </p>
                ) : (
                    <div className="space-y-2">
                        {shift.assignments.map((a) => (
                            <div
                                key={a.id}
                                className="flex items-center justify-between border rounded-lg p-2"
                            >
                                <div>
                                    <p className="font-medium">
                                        {a.user.firstName} {a.user.lastName}
                                    </p>
                                    {a.user.skills.length > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {a.user.skills
                                                .map((s) => s.name)
                                                .join(", ")}
                                        </p>
                                    )}
                                </div>
                                {canManage && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemove(a.id)}
                                        disabled={removingId === a.id}
                                    >
                                        {removingId === a.id ? (
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
                        ))}
                    </div>
                )}
            </div>

            {/* Assign Staff */}
            {canManage && (
                <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Assign Staff</h4>

                    <Select
                        value={selectedUserId}
                        onValueChange={(val) => {
                            setSelectedUserId(val);
                            if (constraintResult.errors.length > 0) {
                                setShowOverride(false);
                            }
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select staff member" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableStaff.length === 0 ? (
                                <SelectItem value="none" disabled>
                                    No eligible staff available
                                </SelectItem>
                            ) : (
                                availableStaff.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.firstName} {u.lastName} (
                                        {u.skills.map((s) => s.name).join(", ")}
                                        )
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>

                    {/* What-If Impact Panel */}
                    {selectedUserId && (
                        <div className="mt-3">
                            <WhatIfPanel
                                shiftId={shift.id}
                                staffId={selectedUserId}
                                userId={userId}
                                userRole={userRole}
                            />
                        </div>
                    )}

                    {/* Constraint Errors */}
                    {!constraintResult.allowed && (
                        <div className="mt-3 space-y-2">
                            {constraintResult.errors.map((err, i) => (
                                <Alert key={`error-${i}`} variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>{err}</AlertDescription>
                                </Alert>
                            ))}

                            {constraintResult.warnings.map((warn, i) => (
                                <Alert
                                    key={`warn-${i}`}
                                    variant="default"
                                    className="border-yellow-400 bg-yellow-50"
                                >
                                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                    <AlertDescription>
                                        {warn.reason}
                                    </AlertDescription>
                                </Alert>
                            ))}

                            {constraintResult.suggestions.length > 0 && (
                                <div className="space-y-1">
                                    <h5 className="font-medium text-sm flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4 text-blue-600" />
                                        Suggested Alternatives
                                    </h5>
                                    {constraintResult.suggestions.map(
                                        (s, i) => {
                                            const user =
                                                shift.eligibleStaff.find(
                                                    (u) => u.id === s.userId,
                                                );
                                            if (!user) return null;
                                            return (
                                                <Alert
                                                    key={`suggestion-${i}`}
                                                    variant="default"
                                                    className="border-blue-400 bg-blue-50"
                                                >
                                                    <AlertDescription>
                                                        {user.firstName}{" "}
                                                        {user.lastName} —{" "}
                                                        {s.reason} (
                                                        {user.skills
                                                            .map(
                                                                (sk) => sk.name,
                                                            )
                                                            .join(", ")}
                                                        )
                                                    </AlertDescription>
                                                </Alert>
                                            );
                                        },
                                    )}
                                </div>
                            )}

                            {!showOverride && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowOverride(true)}
                                >
                                    Override Constraints
                                </Button>
                            )}

                            {showOverride && (
                                <input
                                    className="w-full border rounded-md px-3 py-2"
                                    placeholder="Reason for override..."
                                    value={overrideReason}
                                    onChange={(e) =>
                                        setOverrideReason(e.target.value)
                                    }
                                />
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                        <Button
                            onClick={handleAssign}
                            className="min-w-30 p-5"
                            disabled={
                                !selectedUserId ||
                                assignMutation.isPending ||
                                (showOverride && !overrideReason.trim())
                            }
                        >
                            {assignMutation.isPending ? (
                                <ClipLoader size={18} color="#fff" />
                            ) : (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Assign
                                </>
                            )}
                        </Button>

                        {shift.status === "DRAFT" && (
                            <Button
                                variant="outline"
                                className="p-5 min-w-30"
                                onClick={() =>
                                    updateStatusMutation.mutate("PUBLISHED")
                                }
                                disabled={updateStatusMutation.isPending}
                            >
                                {updateStatusMutation.isPending ? (
                                    <ClipLoader size={18} color="#0E172B" />
                                ) : (
                                    <>Publish</>
                                )}
                            </Button>
                        )}

                        {shift.status === "PUBLISHED" && (
                            <Button
                                variant="outline"
                                className="p-5 min-w-30"
                                onClick={() =>
                                    updateStatusMutation.mutate("DRAFT")
                                }
                                disabled={
                                    updateStatusMutation.isPending ||
                                    shiftStarted
                                }
                                title={
                                    shiftStarted
                                        ? "Cannot unpublish a shift that has already started"
                                        : undefined
                                }
                            >
                                {updateStatusMutation.isPending ? (
                                    <ClipLoader size={18} color="#0E172B" />
                                ) : (
                                    <>Unpublish</>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function ShiftInfo({ shift }: { shift: ShiftDetailFrontend }) {
    const date = new Date(shift.date);
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);

    return (
        <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold">{shift.location.name}</h3>
                <div className="flex gap-2">
                    <Badge>{shift.status}</Badge>
                    {shift.isPremium && (
                        <Badge className="bg-amber-500 text-white">
                            Premium
                        </Badge>
                    )}
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                {format(date, "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-sm">
                {format(start, "h:mm a")} - {format(end, "h:mm a")}
            </p>
        </div>
    );
}
