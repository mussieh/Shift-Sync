"use server";

import { prisma } from "@/lib/db/prisma";

export interface NotificationFrontend {
    id: string;
    message: string;
    read: boolean;
    createdAt: string;
}

export interface NotificationPreferenceFrontend {
    emailEnabled: boolean;
    inAppEnabled: boolean;
}

export async function getNotifications(
    userId: string,
): Promise<NotificationFrontend[]> {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });

        return notifications.map((n) => ({
            id: n.id,
            message: n.message,
            read: n.read,
            createdAt: n.createdAt.toISOString(),
        }));
    } catch (err) {
        console.error("getNotifications error:", err);
        return [];
    }
}

export async function markNotificationRead(
    userId: string,
    notificationId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) return { success: false, error: "Not found" };
        if (notification.userId !== userId)
            return { success: false, error: "Not authorized" };

        await prisma.notification.update({
            where: { id: notificationId },
            data: { read: true },
        });

        return { success: true };
    } catch (err) {
        console.error("markNotificationRead error:", err);
        return { success: false, error: (err as Error).message };
    }
}

export async function markAllNotificationsRead(
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
        });

        return { success: true };
    } catch (err) {
        console.error("markAllNotificationsRead error:", err);
        return { success: false, error: (err as Error).message };
    }
}

export async function getNotificationPreferences(
    userId: string,
): Promise<NotificationPreferenceFrontend> {
    try {
        const prefs = await prisma.notificationPreference.findUnique({
            where: { userId },
        });

        return {
            emailEnabled: prefs?.emailEnabled ?? false,
            inAppEnabled: prefs?.inAppEnabled ?? true,
        };
    } catch (err) {
        console.error("getNotificationPreferences error:", err);
        return { emailEnabled: false, inAppEnabled: true };
    }
}

export async function updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferenceFrontend,
): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, ...preferences },
            update: preferences,
        });

        return { success: true };
    } catch (err) {
        console.error("updateNotificationPreferences error:", err);
        return { success: false, error: (err as Error).message };
    }
}
