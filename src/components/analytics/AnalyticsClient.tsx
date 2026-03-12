"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import {
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    CheckCircle,
    XCircle,
    TrendingUp,
    Users,
    DollarSign,
    Star,
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GridLoader } from "react-spinners";
import {
    getAnalyticsData,
    StaffHoursSummary,
    OvertimeCostSummary,
    FairnessSummary,
} from "@/lib/actions/analytics";

interface AnalyticsClientProps {
    locationIds: string[];
}

async function fetchAnalytics(weekStart: Date, locationIds: string[]) {
    return getAnalyticsData(weekStart, locationIds);
}

export default function AnalyticsClient({ locationIds }: AnalyticsClientProps) {
    const [weekStart, setWeekStart] = useState<Date>(() => {
        const d = startOfWeek(new Date(), { weekStartsOn: 1 });
        return d;
    });

    const { data, isLoading } = useQuery({
        queryKey: [
            "analytics",
            weekStart.getTime(),
            JSON.stringify(locationIds),
        ],
        queryFn: () => fetchAnalytics(weekStart, locationIds),
        staleTime: 1000 * 60 * 2,
    });

    const handleWeekChange = (delta: number) => {
        const next = new Date(weekStart);
        next.setDate(next.getDate() + delta * 7);
        setWeekStart(next);
    };

    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);

    if (isLoading || !data) {
        return (
            <div className="w-full h-full flex justify-center items-center min-h-96">
                <GridLoader color="#0E172B" />
            </div>
        );
    }

    const { staffSummaries, overtimeCost, fairness } = data;

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Analytics</h1>
                    <p className="text-muted-foreground mt-1">
                        Overtime tracking, labor compliance & fairness analytics
                    </p>
                </div>
                <WeekNavigation
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    onWeekChange={handleWeekChange}
                />
            </div>

            {/* KPI Cards */}
            <KpiRow
                staffSummaries={staffSummaries}
                overtimeCost={overtimeCost}
                fairness={fairness}
            />

            {/* Overtime & Labor Compliance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <OvertimeSummaryCard staffSummaries={staffSummaries} />
                <DailyComplianceCard staffSummaries={staffSummaries} />
            </div>

            {/* Projected Overtime Cost */}
            <OvertimeCostCard overtimeCost={overtimeCost} />

            {/* Hours vs Desired Chart */}
            <HoursComparisonChart staffSummaries={staffSummaries} />

            {/* Fairness */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <FairnessScoreCard fairness={fairness} />
                <PremiumDistributionCard fairness={fairness} />
            </div>

            {/* Hours Alignment */}
            <HoursAlignmentCard staffSummaries={staffSummaries} />
        </div>
    );
}

// ─── Week Navigation ───────────────────────────────────────────────────────────
function WeekNavigation({
    weekStart,
    weekEnd,
    onWeekChange,
}: {
    weekStart: Date;
    weekEnd: Date;
    onWeekChange: (delta: number) => void;
}) {
    return (
        <div className="flex items-center gap-3">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onWeekChange(-1)}
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-40 text-center">
                {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            </span>
            <Button variant="outline" size="sm" onClick={() => onWeekChange(1)}>
                <ChevronRight className="w-4 h-4" />
            </Button>
        </div>
    );
}

// ─── KPI Row ───────────────────────────────────────────────────────────────────
function KpiRow({
    staffSummaries,
    overtimeCost,
    fairness,
}: {
    staffSummaries: StaffHoursSummary[];
    overtimeCost: OvertimeCostSummary;
    fairness: FairnessSummary;
}) {
    const overtimeCount = staffSummaries.filter(
        (s) => s.overtimeRisk === "overtime",
    ).length;
    const warningCount = staffSummaries.filter(
        (s) => s.overtimeRisk === "warning",
    ).length;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
                icon={<Users className="w-5 h-5 text-blue-600" />}
                label="Staff Scheduled"
                value={staffSummaries.length}
                sub="this week"
                color="blue"
            />
            <KpiCard
                icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
                label="Overtime / Warning"
                value={`${overtimeCount} / ${warningCount}`}
                sub="staff members"
                color="red"
            />
            <KpiCard
                icon={<DollarSign className="w-5 h-5 text-orange-500" />}
                label="Projected OT Cost"
                value={`$${overtimeCost.projectedOvertimeCost.toFixed(0)}`}
                sub={`${overtimeCost.totalOvertimeHours.toFixed(1)}h overtime`}
                color="orange"
            />
            <KpiCard
                icon={<Star className="w-5 h-5 text-amber-500" />}
                label="Fairness Score"
                value={`${fairness.fairnessScore.toFixed(0)}/100`}
                sub="premium shift equity"
                color="amber"
            />
        </div>
    );
}

function KpiCard({
    icon,
    label,
    value,
    sub,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub: string;
    color: string;
}) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg bg-${color}-50`}>
                        {icon}
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                        {label}
                    </p>
                </div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
        </Card>
    );
}

// ─── Overtime Summary Card ─────────────────────────────────────────────────────
function OvertimeSummaryCard({
    staffSummaries,
}: {
    staffSummaries: StaffHoursSummary[];
}) {
    const sorted = [...staffSummaries]
        .sort((a, b) => b.scheduledHours - a.scheduledHours)
        .slice(0, 10);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Weekly Hours & Overtime
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {sorted.map((item) => {
                        const pct = Math.min(
                            100,
                            (item.scheduledHours / 50) * 100,
                        );
                        const barColor =
                            item.overtimeRisk === "overtime"
                                ? "bg-red-500"
                                : item.overtimeRisk === "warning"
                                  ? "bg-yellow-400"
                                  : "bg-blue-500";

                        return (
                            <div key={item.userId}>
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm font-medium">
                                        {item.firstName} {item.lastName}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {item.scheduledHours.toFixed(1)}h
                                        </span>
                                        {item.overtimeRisk === "overtime" && (
                                            <Badge
                                                variant="destructive"
                                                className="text-xs h-5"
                                            >
                                                🔴 +
                                                {item.overtimeHours.toFixed(1)}h
                                                OT
                                            </Badge>
                                        )}
                                        {item.overtimeRisk === "warning" && (
                                            <Badge
                                                variant="outline"
                                                className="text-xs h-5 border-yellow-400 text-yellow-700"
                                            >
                                                🟡 Warning
                                            </Badge>
                                        )}
                                        {item.overtimeRisk === "none" && (
                                            <Badge
                                                variant="secondary"
                                                className="text-xs h-5"
                                            >
                                                ✅ OK
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-2 rounded-full transition-all ${barColor}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                {/* Threshold markers */}
                                <div className="relative h-0">
                                    <div
                                        className="absolute top-0 h-2 w-px bg-yellow-400 opacity-60"
                                        style={{ left: `${(35 / 50) * 100}%` }}
                                    />
                                    <div
                                        className="absolute top-0 h-2 w-px bg-red-500 opacity-60"
                                        style={{ left: `${(40 / 50) * 100}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />{" "}
                        35h warning
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{" "}
                        40h overtime
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Daily Compliance Card ─────────────────────────────────────────────────────
function DailyComplianceCard({
    staffSummaries,
}: {
    staffSummaries: StaffHoursSummary[];
}) {
    const violations = staffSummaries.filter(
        (s) => s.dailyViolations.length > 0 || s.consecutiveDayWarning !== null,
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Daily & Consecutive
                    Day Alerts
                </CardTitle>
            </CardHeader>
            <CardContent>
                {violations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                        <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                        <p className="text-sm">
                            No daily or consecutive day violations this week
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {violations.map((item) => (
                            <div
                                key={item.userId}
                                className="border rounded-lg p-3 space-y-2"
                            >
                                <p className="text-sm font-semibold">
                                    {item.firstName} {item.lastName}
                                </p>
                                {item.dailyViolations.map((v) => (
                                    <div
                                        key={v.date}
                                        className="flex items-center gap-2"
                                    >
                                        {v.type === "block" ? (
                                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                        ) : (
                                            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                                        )}
                                        <p className="text-xs">
                                            {format(
                                                new Date(v.date),
                                                "EEE MMM d",
                                            )}
                                            : {v.hours.toFixed(1)}h{" "}
                                            {v.type === "block"
                                                ? "(exceeds 12h — hard block)"
                                                : "(exceeds 8h — warning)"}
                                        </p>
                                    </div>
                                ))}
                                {item.consecutiveDayWarning === "seventh" && (
                                    <div className="flex items-center gap-2">
                                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                        <p className="text-xs text-red-600">
                                            7th consecutive day — requires
                                            manager override with documented
                                            reason
                                        </p>
                                    </div>
                                )}
                                {item.consecutiveDayWarning === "sixth" && (
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                                        <p className="text-xs text-yellow-700">
                                            6th consecutive day worked — review
                                            recommended
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Overtime Cost Card ────────────────────────────────────────────────────────
function OvertimeCostCard({
    overtimeCost,
}: {
    overtimeCost: OvertimeCostSummary;
}) {
    if (overtimeCost.affectedStaff.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" /> Projected Overtime
                        Cost
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <p className="text-sm">
                            No overtime projected this week. Great scheduling!
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Projected Overtime Cost
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-8 mb-6">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Total OT Hours
                        </p>
                        <p className="text-3xl font-bold text-red-600">
                            {overtimeCost.totalOvertimeHours.toFixed(1)}h
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Projected OT Cost
                        </p>
                        <p className="text-3xl font-bold text-orange-600">
                            ${overtimeCost.projectedOvertimeCost.toFixed(0)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Regular Hours
                        </p>
                        <p className="text-3xl font-bold">
                            {overtimeCost.totalRegularHours.toFixed(1)}h
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    {overtimeCost.affectedStaff.map((staff) => (
                        <div
                            key={staff.userId}
                            className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg"
                        >
                            <div>
                                <p className="font-medium text-sm">
                                    {staff.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {staff.overtimeHours.toFixed(1)}h overtime
                                </p>
                            </div>
                            <Badge variant="destructive">
                                ${staff.estimatedCost.toFixed(0)} extra
                            </Badge>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                    * Estimates based on 1.5× base rate of $20/hr
                </p>
            </CardContent>
        </Card>
    );
}

// ─── Hours Comparison Chart ────────────────────────────────────────────────────
function HoursComparisonChart({
    staffSummaries,
}: {
    staffSummaries: StaffHoursSummary[];
}) {
    const chartData = [...staffSummaries]
        .sort((a, b) => b.scheduledHours - a.scheduledHours)
        .slice(0, 12)
        .map((s) => ({
            name: `${s.firstName} ${s.lastName[0]}.`,
            scheduled: parseFloat(s.scheduledHours.toFixed(1)),
            desired: s.desiredHours,
            overtime:
                s.overtimeHours > 0
                    ? parseFloat(s.overtimeHours.toFixed(1))
                    : 0,
        }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Hours vs. Desired Hours</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                        data={chartData}
                        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar
                            dataKey="desired"
                            fill="#cbd5e1"
                            name="Desired Hours"
                        />
                        <Bar
                            dataKey="scheduled"
                            name="Scheduled Hours"
                            fill="#3b82f6"
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={index}
                                    fill={
                                        entry.scheduled >= 40
                                            ? "#ef4444"
                                            : entry.scheduled >= 35
                                              ? "#f59e0b"
                                              : "#3b82f6"
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

// ─── Fairness Score Card ───────────────────────────────────────────────────────
function FairnessScoreCard({ fairness }: { fairness: FairnessSummary }) {
    const score = fairness.fairnessScore;
    const color =
        score >= 80
            ? "text-green-600"
            : score >= 60
              ? "text-yellow-600"
              : "text-red-600";
    const progressColor =
        score >= 80
            ? "bg-green-500"
            : score >= 60
              ? "bg-yellow-400"
              : "bg-red-500";

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" /> Premium Shift
                    Fairness
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground font-medium">
                        Fairness Score
                    </p>
                    <p className={`text-4xl font-bold ${color}`}>
                        {score.toFixed(0)}
                    </p>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                        className={`h-3 rounded-full transition-all ${progressColor}`}
                        style={{ width: `${score}%` }}
                    />
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                    {score >= 80
                        ? "✅ Premium shifts are distributed equitably."
                        : score >= 60
                          ? "⚠️ Mild imbalance detected — review premium assignments."
                          : "🔴 Significant imbalance — redistribute premium shifts."}
                </p>
                <div className="text-xs space-y-1 text-muted-foreground">
                    <p>
                        Avg premium shifts per staff:{" "}
                        <span className="font-semibold text-foreground">
                            {fairness.avgPremiumShifts.toFixed(1)}
                        </span>
                    </p>
                    <p>
                        Variance:{" "}
                        <span className="font-semibold text-foreground">
                            {fairness.premiumVariance.toFixed(2)}
                        </span>
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Premium Distribution Card ─────────────────────────────────────────────────
function PremiumDistributionCard({ fairness }: { fairness: FairnessSummary }) {
    const sorted = [...fairness.staff]
        .sort((a, b) => b.premiumShifts - a.premiumShifts)
        .slice(0, 8);
    const max = sorted[0]?.premiumShifts ?? 1;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Premium Shift Distribution</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {sorted.map((item) => (
                        <div key={item.userId}>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span>{item.name}</span>
                                <span className="font-medium flex items-center gap-1">
                                    <Star className="w-3 h-3 text-amber-400" />
                                    {item.premiumShifts}
                                </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-2 rounded-full bg-amber-400 transition-all"
                                    style={{
                                        width:
                                            max > 0
                                                ? `${(item.premiumShifts / max) * 100}%`
                                                : "0%",
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    {sorted.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No premium shifts this week
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Hours Alignment Card ──────────────────────────────────────────────────────
function HoursAlignmentCard({
    staffSummaries,
}: {
    staffSummaries: StaffHoursSummary[];
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Hours Alignment — Desired vs. Scheduled</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {staffSummaries.map((item) => {
                        const diff = item.scheduledHours - item.desiredHours;
                        const status =
                            Math.abs(diff) <= 5
                                ? "aligned"
                                : diff < 0
                                  ? "under"
                                  : "over";

                        return (
                            <div
                                key={item.userId}
                                className="flex items-center justify-between p-3 border rounded-lg"
                            >
                                <div>
                                    <p className="font-medium text-sm">
                                        {item.firstName} {item.lastName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Desired: {item.desiredHours}h ·
                                        Scheduled:{" "}
                                        {item.scheduledHours.toFixed(1)}h
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        status === "aligned"
                                            ? "secondary"
                                            : status === "under"
                                              ? "outline"
                                              : "destructive"
                                    }
                                >
                                    {status === "aligned"
                                        ? `✅ ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}h`
                                        : status === "under"
                                          ? `⚠️ ${diff.toFixed(1)}h (under)`
                                          : `🔴 +${diff.toFixed(1)}h (over)`}
                                </Badge>
                            </div>
                        );
                    })}
                    {staffSummaries.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No staff scheduled this week
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
