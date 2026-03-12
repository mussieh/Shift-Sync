"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { getWhatIfImpact } from "@/lib/actions/analytics";
import { startOfWeek } from "date-fns";
import { getManagedLocations } from "@/lib/actions/locations";

interface WhatIfPanelProps {
    shiftId: string;
    staffId: string;
    userId: string;
    userRole: "ADMIN" | "MANAGER" | "STAFF";
}

/**
 * Drop this inside ShiftDetailDialog when a manager is about to assign staff.
 * Shows the real-time overtime / daily hours / consecutive day impact.
 */
export default function WhatIfPanel({
    shiftId,
    staffId,
    userId,
    userRole,
}: WhatIfPanelProps) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

    const { data: locations = [] } = useQuery({
        queryKey: ["managedLocations", userId],
        queryFn: () => getManagedLocations(userId, userRole),
        enabled: userRole !== "STAFF",
    });
    const locationIds = locations.map((l: { id: string }) => l.id);

    const { data: impact, isLoading } = useQuery({
        queryKey: ["whatIf", shiftId, staffId, weekStart.getTime()],
        queryFn: () =>
            getWhatIfImpact(shiftId, staffId, weekStart, locationIds),
        enabled: !!staffId && locationIds.length > 0,
        staleTime: 30000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking impact…
            </div>
        );
    }

    if (!impact) return null;

    const hasProblem = impact.blocked || impact.warnings.length > 0;

    return (
        <div
            className={`rounded-lg border p-4 space-y-3 text-sm ${
                impact.blocked
                    ? "bg-red-50 border-red-200"
                    : impact.warnings.length > 0
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-green-50 border-green-100"
            }`}
        >
            <p className="font-semibold flex items-center gap-2">
                {impact.blocked ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                ) : impact.warnings.length > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                ) : (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                )}
                What-If Impact: {impact.name}
            </p>

            <div className="grid grid-cols-3 gap-3 text-xs">
                <Stat
                    label="Current Hours"
                    value={`${impact.currentHours.toFixed(1)}h`}
                />
                <Stat
                    label="After Assignment"
                    value={`${impact.newHours.toFixed(1)}h`}
                    highlight={
                        impact.newHours >= 40
                            ? "red"
                            : impact.newHours >= 35
                              ? "yellow"
                              : undefined
                    }
                />
                <Stat
                    label="Daily Hours"
                    value={`${impact.dailyHoursAfter.toFixed(1)}h`}
                    highlight={
                        impact.dailyHoursAfter > 12
                            ? "red"
                            : impact.dailyHoursAfter > 8
                              ? "yellow"
                              : undefined
                    }
                />
            </div>

            {impact.blocked && (
                <div className="space-y-1">
                    {impact.blockReasons.map((r, i) => (
                        <p
                            key={i}
                            className="text-xs text-red-700 flex items-start gap-1.5"
                        >
                            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{" "}
                            {r}
                        </p>
                    ))}
                </div>
            )}

            {impact.warnings.map((w, i) => (
                <p
                    key={i}
                    className="text-xs text-yellow-700 flex items-start gap-1.5"
                >
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{" "}
                    {w}
                </p>
            ))}

            {!hasProblem && (
                <p className="text-xs text-green-700">
                    No compliance issues with this assignment.
                </p>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    highlight,
}: {
    label: string;
    value: string;
    highlight?: "red" | "yellow";
}) {
    const valueClass =
        highlight === "red"
            ? "text-red-600 font-bold"
            : highlight === "yellow"
              ? "text-yellow-700 font-bold"
              : "font-semibold";
    return (
        <div className="bg-white/70 rounded p-2 text-center">
            <p className="text-muted-foreground mb-0.5">{label}</p>
            <p className={valueClass}>{value}</p>
        </div>
    );
}
