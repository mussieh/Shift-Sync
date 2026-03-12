import { auth } from "@/auth";
import ScheduleClient from "@/components/schedule/ScheduleClient";

export default async function SchedulePage() {
    const currentUser = (await auth())?.user;

    return (
        <ScheduleClient
            currentUser={currentUser!}
            initialWeekStart={new Date()}
        />
    );
}
