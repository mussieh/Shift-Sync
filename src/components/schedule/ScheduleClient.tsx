"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import CreateShiftDialog from "@/components/schedule/CreateShiftDialog";
import ShiftDetailDialog from "@/components/schedule/ShiftDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getManagedLocations } from "@/lib/actions/locations";
import {
    getWeekShifts,
    publishWeekSchedule,
    WeekShiftFrontend,
} from "@/lib/actions/schedule";
import { ClipLoader, GridLoader } from "react-spinners";
import { Badge } from "../ui/badge";
import { isPremiumShift } from "@/lib/constants";
import React from "react";

// ------------------------
// Types
// ------------------------
interface ScheduleClientProps {
    currentUser: { id: string; role: "ADMIN" | "MANAGER" | "STAFF" };
    initialWeekStart: Date;
}

// ------------------------
// Fetch helper: parse dates once
// ------------------------
async function fetchShiftsForLocations(
    weekStart: Date,
    locationIds: string[],
    user: { id: string; role: "ADMIN" | "MANAGER" | "STAFF" },
): Promise<WeekShiftFrontend[]> {
    // STAFF doesn't need locationIds
    if (user.role !== "STAFF" && !locationIds.length) return [];
    return getWeekShifts(weekStart, locationIds, user);
}

// ------------------------
// Main Component
// ------------------------
export default function ScheduleClient({
    currentUser,
    initialWeekStart,
}: ScheduleClientProps) {
    const canManage =
        currentUser.role === "ADMIN" || currentUser.role === "MANAGER";
    const queryClient = useQueryClient();

    // ------------------------
    // State
    // ------------------------
    const [weekStart, setWeekStart] = useState(initialWeekStart);
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState<string | null>(null);
    const [publishingWeek, setPublishingWeek] = useState(false);

    const { data: locations = [] } = useQuery({
        queryKey: ["managedLocations", currentUser.id],
        queryFn: () => getManagedLocations(currentUser.id, currentUser.role),
        enabled: canManage,
    });

    const locationIds = useMemo(() => locations.map((l) => l.id), [locations]);

    // ------------------------
    // React Query: fetch shifts
    // ------------------------
    const { data: weekShifts = [], isLoading: loadingShifts } = useQuery({
        queryKey: [
            "weekShifts",
            weekStart.getTime(),
            JSON.stringify(locationIds),
            currentUser.id,
        ],
        queryFn: () =>
            fetchShiftsForLocations(weekStart, locationIds, currentUser),
        // Only disable query if a Manager has no locations
        enabled:
            currentUser.role === "STAFF" || // always fetch for staff
            locationIds.length > 0, // fetch for Admin/Manager if they have locations
        staleTime: 1000 * 60 * 5,
    });

    // ------------------------
    // Prefetch previous/next weeks
    // ------------------------
    useEffect(() => {
        if (currentUser.role !== "ADMIN" && currentUser.role !== "MANAGER")
            return;

        if (!locationIds.length) return;

        const nextWeek = new Date(weekStart);
        nextWeek.setDate(weekStart.getDate() + 7);
        const prevWeek = new Date(weekStart);
        prevWeek.setDate(weekStart.getDate() - 7);

        queryClient.prefetchQuery({
            queryKey: [
                "weekShifts",
                nextWeek.getTime(),
                JSON.stringify(locationIds),
                currentUser.id,
            ],
            queryFn: () =>
                fetchShiftsForLocations(nextWeek, locationIds, currentUser),
        });

        queryClient.prefetchQuery({
            queryKey: [
                "weekShifts",
                prevWeek.getTime(),
                JSON.stringify(locationIds),
                currentUser.id,
            ],
            queryFn: () =>
                fetchShiftsForLocations(prevWeek, locationIds, currentUser),
        });
    }, [weekStart, locationIds, queryClient, currentUser]);

    // ------------------------
    // Memoized day -> shifts mapping
    // ------------------------
    const dayShiftMap = useMemo(() => {
        const map: Record<string, WeekShiftFrontend[]> = {};
        weekShifts.forEach((s) => {
            const key = new Date(s.date).toDateString(); // ✅ convert string to Date
            if (!map[key]) map[key] = [];
            map[key].push(s);
        });
        return map;
    }, [weekShifts]);

    // ------------------------
    // Weekdays array
    // ------------------------
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            return date;
        });
    }, [weekStart]);

    // ------------------------
    // Handlers
    // ------------------------
    const handleWeekChange = useCallback(
        (delta: number) => {
            const newWeek = new Date(weekStart);
            newWeek.setDate(weekStart.getDate() + delta);
            setWeekStart(newWeek);
        },
        [weekStart],
    );

    const handlePublishWeek = useCallback(async () => {
        if (!canManage || publishingWeek) return;
        setPublishingWeek(true);

        try {
            // 1️⃣ Call backend to publish the week
            const res = await publishWeekSchedule(
                currentUser.id,
                weekStart,
                locationIds,
            );

            // 2️⃣ Optimistically update cache for published shifts
            queryClient.setQueryData(
                [
                    "weekShifts",
                    weekStart.getTime(),
                    JSON.stringify(locationIds),
                ],
                (old: WeekShiftFrontend[] | undefined) => {
                    if (!old) return old;
                    return old.map((shift) =>
                        res.published.find((p) => p.id === shift.id)
                            ? { ...shift, status: "PUBLISHED" }
                            : shift,
                    );
                },
            );

            // 3️⃣ Show toast immediately
            toast.custom(
                () => (
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
                                    <ul className="ml-4 list-disc text-sm text-gray-700 space-y-1">
                                        {res.published.map((shift) => (
                                            <li key={shift.id}>
                                                {shift.description}
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
                                    <ul className="ml-4 list-disc text-sm text-gray-700 space-y-1">
                                        {res.blocked.map((b) => (
                                            <li key={b.id}>
                                                {b.description} — {b.reason}
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

            // 4️⃣ REFRESH: ensure cache is in sync with backend
            await queryClient.invalidateQueries({
                queryKey: [
                    "weekShifts",
                    weekStart.getTime(),
                    JSON.stringify(locationIds),
                ],
            });
        } catch (err: unknown) {
            let message = "Publish failed";
            if (err instanceof Error) message = err.message;
            toast.error(message);
        } finally {
            setPublishingWeek(false);
        }
    }, [
        canManage,
        publishingWeek,
        currentUser.id,
        weekStart,
        locationIds,
        queryClient,
    ]);

    // ------------------------
    // Render
    // ------------------------
    if (canManage && !locations.length)
        return (
            <div className="w-full h-full flex justify-center items-center">
                <GridLoader color="#0E172B" />
            </div>
        );

    return (
        <div className="p-8">
            <Header
                canManage={canManage}
                setCreateOpen={setCreateOpen}
                publishingWeek={publishingWeek}
                handlePublishWeek={handlePublishWeek}
            />

            <WeekNavigation
                weekStart={weekStart}
                handleWeekChange={handleWeekChange}
            />

            <CalendarGrid
                weekDays={weekDays}
                dayShiftMap={dayShiftMap}
                loadingShifts={loadingShifts}
                setSelectedShift={setSelectedShift}
            />

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
                    userRole={currentUser.role}
                />
            )}
        </div>
    );
}

// ------------------------
// Header
// ------------------------
function Header({
    canManage,
    setCreateOpen,
    publishingWeek,
    handlePublishWeek,
}: {
    canManage: boolean;
    setCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
    publishingWeek: boolean;
    handlePublishWeek: () => Promise<void>;
}) {
    return (
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-bold">Schedule</h1>
                <p className="text-muted-foreground mt-1">
                    {canManage
                        ? "Manage shifts across all locations"
                        : "Assigned Shifts"}
                </p>
            </div>

            {canManage && (
                <div className="flex gap-2">
                    <Button className="p-5" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Create Shift
                    </Button>
                    <Button
                        className="p-5"
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
    );
}

// ------------------------
// Week Navigation
// ------------------------
function WeekNavigation({
    weekStart,
    handleWeekChange,
}: {
    weekStart: Date;
    handleWeekChange: (delta: number) => void;
}) {
    return (
        <div className="flex items-center justify-between mb-6">
            <Button
                variant="outline"
                size="sm"
                onClick={() => handleWeekChange(-7)}
            >
                <ChevronLeft className="w-4 h-4" /> Previous Week
            </Button>

            <h2 className="text-lg font-semibold">
                {format(weekStart, "MMM d")} -{" "}
                {format(
                    new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
                    "MMM d, yyyy",
                )}
            </h2>

            <Button
                variant="outline"
                size="sm"
                onClick={() => handleWeekChange(7)}
            >
                Next Week <ChevronRight className="w-4 h-4" />
            </Button>
        </div>
    );
}

// ------------------------
// Calendar Grid
// ------------------------
function CalendarGrid({
    weekDays,
    dayShiftMap,
    loadingShifts,
    setSelectedShift,
}: {
    weekDays: Date[];
    dayShiftMap: Record<string, WeekShiftFrontend[]>;
    loadingShifts: boolean;
    setSelectedShift: (shiftId: string) => void;
}) {
    return (
        <div className="grid grid-cols-7 gap-4">
            {weekDays.map((day: Date) => {
                const dayShifts: WeekShiftFrontend[] =
                    dayShiftMap[day.toDateString()] ?? [];
                return (
                    <DayColumn
                        key={day.toISOString()}
                        day={day}
                        shifts={dayShifts}
                        loading={loadingShifts}
                        setSelectedShift={setSelectedShift}
                    />
                );
            })}
        </div>
    );
}

// ------------------------
// Day Column
// ------------------------
const DayColumn = React.memo(function DayColumn({
    day,
    shifts,
    loading,
    setSelectedShift,
}: {
    day: Date;
    shifts: WeekShiftFrontend[];
    loading: boolean;
    setSelectedShift: (shiftId: string) => void;
}) {
    const dayName = format(day, "EEE");
    const dayNum = format(day, "d");

    return (
        <div className="min-h-75">
            <div className="bg-slate-100 p-2 rounded-t-lg text-center">
                <p className="text-sm font-medium text-slate-600">{dayName}</p>
                <p className="text-2xl font-bold">{dayNum}</p>
            </div>

            <Card className="rounded-t-none min-h-62.5">
                <CardContent className="p-2 space-y-2">
                    {loading ? (
                        <div className="flex justify-center items-center">
                            <ClipLoader size={16} color="#0E172B" />
                        </div>
                    ) : shifts.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                            No shifts
                        </p>
                    ) : (
                        shifts.map((shift: WeekShiftFrontend) => (
                            <ShiftCard
                                key={shift.id}
                                shift={shift}
                                onClick={() => setSelectedShift(shift.id)}
                            />
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
});

// ------------------------
// Shift Card
// ------------------------
const ShiftCard = React.memo(function ShiftCard({
    shift,
    onClick,
}: {
    shift: WeekShiftFrontend;
    onClick: () => void;
}) {
    const assignments = shift.assignments ?? [];
    return (
        <button
            onClick={onClick}
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
                {isPremiumShift(
                    new Date(shift.startTime),
                    new Date(shift.endTime),
                ) && (
                    <Badge className="h-5 text-xs bg-amber-500 text-white">
                        Premium
                    </Badge>
                )}
            </div>

            <p className="text-xs text-slate-600">
                {format(shift.startTime, "h:mm a")} -{" "}
                {format(shift.endTime, "h:mm a")}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="h-5 text-xs">
                    {assignments.length === 0
                        ? "Unassigned"
                        : `${assignments.length} assigned`}
                </Badge>
                {shift.status === "DRAFT" && (
                    <Badge variant="secondary" className="h-5 text-xs">
                        Draft
                    </Badge>
                )}
            </div>
        </button>
    );
});
