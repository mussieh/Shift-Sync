// app/schedule/page.tsx
import { getWeekShifts, WeekShiftFrontend } from "@/lib/actions/schedule";
import {
    getManagedLocations,
    ManagedLocationFrontend,
} from "@/lib/actions/locations";
import { auth } from "@/auth";
import ScheduleClient from "@/components/schedule/ScheduleClient";

export default async function SchedulePage() {
    // Default to today
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);

    // Fetch current user server-side
    const currentUser = (await auth())?.user;

    if (!currentUser) return null; // optionally redirect to login

    const canManage =
        currentUser.role === "ADMIN" || currentUser.role === "MANAGER";

    // Fetch locations only if user can manage
    const locations: ManagedLocationFrontend[] = canManage
        ? await getManagedLocations(currentUser.id)
        : [];

    // Fetch week shifts
    const shifts: WeekShiftFrontend[] = locations.length
        ? await getWeekShifts(
              weekStart,
              locations.map((l) => l.id),
          )
        : [];

    return (
        <ScheduleClient
            currentUser={currentUser}
            locations={locations}
            initialShifts={shifts}
            initialWeekStart={weekStart}
        />
    );
}
