import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
    getNotificationPreferences,
    getNotifications,
} from "@/lib/actions/notifications";
import NotificationsClient from "@/components/notifications/NotificationsClient";

export default async function NotificationsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const { id: userId } = session.user;

    const [notifications, preferences] = await Promise.all([
        getNotifications(userId),
        getNotificationPreferences(userId),
    ]);

    return (
        <NotificationsClient
            userId={userId}
            initialNotifications={notifications}
            initialPreferences={preferences}
        />
    );
}
