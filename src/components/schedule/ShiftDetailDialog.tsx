"use client";

import { assignStaffToShift, getShiftDetails } from "@/lib/actions/schedule";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Users, Check, X } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";

interface User {
    id: string;
    firstName: string;
    lastName: string;
    role: "ADMIN" | "MANAGER" | "STAFF";
}

interface Skill {
    id: string;
    name: string;
}

interface ShiftRequirement {
    id: string;
    quantity: number;
    skill: Skill;
}

interface ShiftAssignment {
    id: string;
    user: User;
}

interface Location {
    id: string;
    name: string;
    timezone: string;
}

interface ShiftDetail {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    isPremium: boolean;
    status: "DRAFT" | "PUBLISHED";
    location: Location;
    requirements: ShiftRequirement[];
    assignments: ShiftAssignment[];
}

interface Props {
    shiftId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    canManage: boolean;
}

export default function ShiftDetailDialog({
    shiftId,
    open,
    onOpenChange,
    userId,
    canManage,
}: Props) {
    const [shift, setShift] = useState<ShiftDetail | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [loading, setLoading] = useState(false);

    // Load shift details
    const loadShift = useCallback(async () => {
        try {
            const data = await getShiftDetails(shiftId);
            setShift(data);
        } catch (err: unknown) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : "Failed to load shift details",
            );
        }
    }, [shiftId]);

    useEffect(() => {
        if (!open) return;
        loadShift();
    }, [open, loadShift]);

    // Assign staff to shift
    const handleAssign = async () => {
        if (!selectedUserId) return toast.error("Select a user to assign");
        setLoading(true);
        try {
            const res = await assignStaffToShift(
                userId,
                shiftId,
                selectedUserId,
            );
            if (!res.success) {
                toast.error(res.errors?.join("\n") ?? "Failed to assign staff");
                return;
            }
            toast.success("Staff assigned successfully");
            await loadShift();
        } catch (err: unknown) {
            toast.error(
                err instanceof Error ? err.message : "Failed to assign staff",
            );
        } finally {
            setLoading(false);
        }
    };

    if (!shift) return null;

    // Prepare data for display
    const requirements = shift.requirements;
    const assignments = shift.assignments;
    const location = shift.location;

    // For simplicity, we use assignments as qualified staff options
    const qualifiedStaff = assignments.map((a) => a.user);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Shift Details</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Shift Info */}
                    <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{location.name}</h3>
                            <div className="flex gap-2">
                                <Badge>{shift.status}</Badge>
                                {shift.isPremium && (
                                    <Badge className="bg-amber-500">
                                        Premium
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {format(new Date(shift.date), "EEEE, MMMM d, yyyy")}
                        </p>
                        <p className="text-sm">
                            {format(new Date(shift.startTime), "h:mm a")} -{" "}
                            {format(new Date(shift.endTime), "h:mm a")}
                        </p>
                    </div>

                    {/* Requirements */}
                    <div>
                        <h4 className="font-medium mb-2">Required Skills</h4>
                        <div className="flex flex-wrap gap-2">
                            {requirements.map((req) => (
                                <Badge key={req.id} variant="outline">
                                    {req.skill.name}:{" "}
                                    {
                                        assignments.filter((a) => a.user.id)
                                            .length
                                    }
                                    /{req.quantity}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Assigned Staff */}
                    <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Assigned Staff (
                            {assignments.length})
                        </h4>
                        {assignments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No staff assigned yet
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {assignments.map((assignment) => (
                                    <div
                                        key={assignment.id}
                                        className="flex items-center justify-between p-2 border rounded-lg"
                                    >
                                        <div>
                                            <p className="font-medium">
                                                {assignment.user.firstName}{" "}
                                                {assignment.user.lastName}
                                            </p>
                                        </div>
                                        {canManage && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    toast.info(
                                                        "Remove not implemented",
                                                    )
                                                }
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Assign Staff (Manager/Admin only) */}
                    {canManage && (
                        <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">Assign Staff</h4>

                            <Select
                                value={selectedUserId}
                                onValueChange={setSelectedUserId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select staff member" />
                                </SelectTrigger>
                                <SelectContent>
                                    {qualifiedStaff.map((user) => (
                                        <SelectItem
                                            key={user.id}
                                            value={user.id}
                                        >
                                            {user.firstName} {user.lastName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="flex gap-2 mt-3">
                                <Button
                                    onClick={handleAssign}
                                    disabled={!selectedUserId || loading}
                                >
                                    <Check className="w-4 h-4 mr-2" /> Assign
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
