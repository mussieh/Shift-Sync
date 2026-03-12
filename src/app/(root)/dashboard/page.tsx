import OnDutyWidget from "@/components/dashboard/OnDutyWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDashboardStats } from "@/lib/actions/dashboard";
import { AlertTriangle, Calendar, Clock, Users } from "lucide-react";

export default async function DashboardPage() {
    const stats = await fetchDashboardStats();

    // Type guards
    const isStaff = stats.role === "STAFF";
    const isManagerOrAdmin = stats.role === "MANAGER" || stats.role === "ADMIN";

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold">
                    Welcome back, {stats.firstName}!
                </h1>
                <p className="text-muted-foreground mt-1">
                    Here&apos;s what&apos;s happening with your schedule
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {isStaff && (
                    <>
                        <StatCard
                            title="Upcoming Shifts"
                            icon={<Calendar />}
                            value={stats.upcomingShifts}
                        />
                        <StatCard
                            title="This Week Hours"
                            icon={<Clock />}
                            value={`${stats.weeklyHours} h`}
                        />
                        <StatCard
                            title="Pending Swaps"
                            icon={<AlertTriangle />}
                            value={stats.pendingSwaps}
                        />
                    </>
                )}

                {isManagerOrAdmin && (
                    <>
                        <StatCard
                            title="On Duty Now"
                            icon={<Users />}
                            value={stats.onDutyAssignments.length}
                        />
                        <StatCard
                            title="Pending Approvals"
                            icon={<AlertTriangle />}
                            value={stats.pendingApprovals}
                        />
                        <StatCard
                            title="Total Staff"
                            icon={<Users />}
                            value={stats.totalStaff}
                        />
                    </>
                )}
            </div>

            {/* On Duty Widget */}
            {isManagerOrAdmin && (
                <OnDutyWidget assignments={stats.onDutyAssignments} />
            )}
        </div>
    );
}

// ----------------------
// Stat Card Component
// ----------------------
function StatCard({
    title,
    icon,
    value,
}: {
    title: string;
    icon: React.ReactNode;
    value: number | string;
}) {
    return (
        <Card>
            <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <div className="h-4 w-4 text-muted-foreground">{icon}</div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    );
}
