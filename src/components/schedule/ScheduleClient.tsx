"use client";

import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

import Loader from "@/components/common/Loader";
import CreateShiftDialog from "@/components/schedule/CreateShiftDialog";
import ShiftDetailDialog from "@/components/schedule/ShiftDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ManagedLocationFrontend } from "@/lib/actions/locations";
import {
    getWeekShifts,
    publishWeekSchedule,
    WeekShiftFrontend,
} from "@/lib/actions/schedule";
import { ClipLoader } from "react-spinners";

interface ScheduleClientProps {
    currentUser: {
        id: string;
        role: "ADMIN" | "MANAGER" | "STAFF";
    };
    locations: ManagedLocationFrontend[];
    initialShifts: WeekShiftFrontend[];
    initialWeekStart: Date;
}

export default function ScheduleClient({
    currentUser,
    locations,
    initialShifts,
    initialWeekStart,
}: ScheduleClientProps) {
    const canManage =
        currentUser.role === "ADMIN" || currentUser.role === "MANAGER";

    const [weekStart, setWeekStart] = useState(initialWeekStart);
    const [weekShifts, setWeekShifts] =
        useState<WeekShiftFrontend[]>(initialShifts);
    const [loadingShifts, setLoadingShifts] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState<string | null>(null);
    const [publishingWeek, setPublishingWeek] = useState(false);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        return date;
    });

    const fetchShifts = async (week: Date) => {
        if (!locations.length) return;
        setLoadingShifts(true);
        try {
            const shifts = await getWeekShifts(
                week,
                locations.map((l) => l.id),
            );
            setWeekShifts(shifts);
        } catch (err: unknown) {
            let message = "Failed to load shifts";
            if (err instanceof Error) message = err.message;
            toast.error(message);
        } finally {
            setLoadingShifts(false);
        }
    };

    const handlePreviousWeek = async () => {
        const newWeek = new Date(weekStart);
        newWeek.setDate(weekStart.getDate() - 7);
        setWeekStart(newWeek);
        await fetchShifts(newWeek);
    };

    const handleNextWeek = async () => {
        const newWeek = new Date(weekStart);
        newWeek.setDate(weekStart.getDate() + 7);
        setWeekStart(newWeek);
        await fetchShifts(newWeek);
    };

    const handlePublishWeek = async () => {
        if (!canManage || publishingWeek) return;

        setPublishingWeek(true); // start spinner / disable button
        try {
            const res = await publishWeekSchedule(
                currentUser.id,
                weekStart,
                locations.map((l) => l.id),
            );

            // Refresh shifts after publish
            await fetchShifts(weekStart);

            // Helper to get readable shift info
            const getShiftLabel = (shiftId: string) => {
                const shift = weekShifts.find((s) => s.id === shiftId);
                if (!shift) return shiftId; // fallback
                return `${shift.location.name}: ${format(new Date(shift.startTime), "h:mm a")} - ${format(new Date(shift.endTime), "h:mm a")}`;
            };

            toast.custom(
                (t) => (
                    <div
                        className={`p-4 rounded-md shadow-md max-w-sm w-full ${
                            res.blocked.length
                                ? "bg-yellow-50 border-l-4 border-yellow-400"
                                : "bg-green-50 border-l-4 border-green-400"
                        }`}
                    >
                        <div className="space-y-2">
                            {res.published.length > 0 && (
                                <div>
                                    <span className="font-semibold text-green-700">
                                        ✅ Published {res.published.length}{" "}
                                        shift
                                        {res.published.length > 1 ? "s" : ""}
                                    </span>
                                    <ul className="ml-4 list-disc text-sm text-gray-700">
                                        {res.published.map((shiftId) => (
                                            <li key={shiftId}>
                                                {getShiftLabel(shiftId)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {res.blocked.length > 0 && (
                                <div>
                                    <span className="font-semibold text-yellow-700">
                                        ⚠️ {res.blocked.length} shift
                                        {res.blocked.length > 1 ? "s" : ""}{" "}
                                        blocked
                                    </span>
                                    <ul className="ml-4 list-disc text-sm text-gray-700">
                                        {res.blocked.map((b) => (
                                            <li key={b.id}>
                                                {getShiftLabel(b.id)} —{" "}
                                                {b.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {res.published.length === 0 &&
                                res.blocked.length === 0 && (
                                    <div className="text-gray-700">
                                        No shifts were published.
                                    </div>
                                )}
                        </div>
                    </div>
                ),
                { duration: 8000 },
            );
        } catch (err: unknown) {
            let message = "Publish failed";
            if (err instanceof Error) message = err.message;
            toast.error(message);
        } finally {
            setPublishingWeek(false); // stop spinner / enable button
        }
    };

    if (!weekShifts) return <Loader />;

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Schedule</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage shifts across all locations
                    </p>
                </div>

                {canManage && (
                    <div className="flex gap-2">
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Shift
                        </Button>
                        <Button
                            onClick={handlePublishWeek}
                            variant="outline"
                            disabled={publishingWeek}
                        >
                            {publishingWeek ? (
                                <ClipLoader size={16} color="#000" />
                            ) : (
                                <Plus className="w-4 h-4 mr-2" />
                            )}
                            Publish Week
                        </Button>
                    </div>
                )}
            </div>

            {/* Week Navigation */}
            <div className="flex items-center justify-between mb-6">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousWeek}
                >
                    <ChevronLeft className="w-4 h-4" />
                    Previous Week
                </Button>

                <h2 className="text-lg font-semibold">
                    {format(weekStart, "MMM d")} -{" "}
                    {format(
                        new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
                        "MMM d, yyyy",
                    )}
                </h2>

                <Button variant="outline" size="sm" onClick={handleNextWeek}>
                    Next Week
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-4">
                {weekDays.map((day) => {
                    const dayShifts = weekShifts.filter(
                        (s) =>
                            new Date(s.date).toDateString() ===
                            day.toDateString(),
                    );

                    const dayName = format(day, "EEE");
                    const dayNum = format(day, "d");

                    return (
                        <div key={day.toISOString()} className="min-h-75">
                            <div className="bg-slate-100 p-2 rounded-t-lg text-center">
                                <p className="text-sm font-medium text-slate-600">
                                    {dayName}
                                </p>
                                <p className="text-2xl font-bold">{dayNum}</p>
                            </div>

                            <Card className="rounded-t-none min-h-62.5">
                                <CardContent className="p-2 space-y-2">
                                    {loadingShifts ? (
                                        <p className="text-xs text-muted-foreground text-center py-4">
                                            Loading shifts...
                                        </p>
                                    ) : dayShifts.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center py-4">
                                            No shifts
                                        </p>
                                    ) : (
                                        dayShifts.map((shift) => (
                                            <button
                                                key={shift.id}
                                                onClick={() =>
                                                    setSelectedShift(shift.id)
                                                }
                                                className={`w-full text-left p-2 rounded-lg border-2 transition-all hover:shadow-md ${
                                                    shift.status === "PUBLISHED"
                                                        ? "bg-blue-50 border-blue-200"
                                                        : "bg-white border-dashed border-slate-300"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between mb-1">
                                                    <p className="text-xs font-medium text-slate-900">
                                                        {shift.location.name}
                                                    </p>
                                                </div>

                                                <p className="text-xs text-slate-600">
                                                    {format(
                                                        new Date(
                                                            shift.startTime,
                                                        ),
                                                        "h:mm a",
                                                    )}{" "}
                                                    -{" "}
                                                    {format(
                                                        new Date(shift.endTime),
                                                        "h:mm a",
                                                    )}
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}
            </div>

            {/* Dialogs */}
            {canManage && locations.length > 0 && (
                <CreateShiftDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    locations={locations}
                    defaultDate={weekStart}
                    userId={currentUser.id}
                />
            )}

            {selectedShift && (
                <ShiftDetailDialog
                    shiftId={selectedShift}
                    open={!!selectedShift}
                    onOpenChange={() => setSelectedShift(null)}
                    userId={currentUser.id}
                    canManage={canManage}
                />
            )}
        </div>
    );
}
