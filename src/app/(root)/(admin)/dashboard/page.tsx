// app/dashboard/page.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Users, AlertTriangle } from "lucide-react";
import OnDutyWidget from "@/components/dashboard/OnDutyWidget";
import { fetchDashboardStats } from "@/lib/actions/dashboard";

export default async function DashboardPage() {
    const stats = await fetchDashboardStats();

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
                {stats.role === "STAFF" && (
                    <>
                        <Card>
                            <CardHeader className="flex justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Upcoming Shifts
                                </CardTitle>
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.upcomingShifts}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    This Week Hours
                                </CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.weeklyHours} h
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Pending Swaps
                                </CardTitle>
                                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.pendingSwaps}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}

                {(stats.role === "MANAGER" || stats.role === "ADMIN") && (
                    <>
                        <Card>
                            <CardHeader className="flex justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    On Duty Now
                                </CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.onDutyAssignments?.length ?? 0}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Pending Approvals
                                </CardTitle>
                                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.pendingApprovals ?? 0}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Total Staff
                                </CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.totalStaff ?? 0}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* On Duty Staff Widget */}
            {(stats.role === "MANAGER" || stats.role === "ADMIN") && (
                <OnDutyWidget
                    assignments={(stats.onDutyAssignments ?? []).map((a) => ({
                        user: {
                            firstName: a.user.firstName,
                            lastName: a.user.lastName,
                        },
                        shift: {
                            startTime: new Date(a.shift.startTime),
                            endTime: new Date(a.shift.endTime),
                            location: { name: a.shift.location.name },
                        },
                        location: { name: a.shift.location.name },
                    }))}
                />
            )}
        </div>
    );
}
