import { getManagedLocations } from "@/lib/actions/locations";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AnalyticsClient from "@/components/analytics/AnalyticsClient";

export default async function AnalyticsPage() {
    const user = (await auth())?.user;

    if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
        redirect("/unauthorized");
    }

    const locations = await getManagedLocations(user.id, user.role);
    const locationIds = locations.map((l) => l.id);

    return <AnalyticsClient locationIds={locationIds} />;
}
