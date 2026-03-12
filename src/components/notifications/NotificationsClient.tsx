"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { BellOff, CheckCheck, Settings, Loader2 } from "lucide-react";
import { ClipLoader } from "react-spinners";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getNotificationPreferences,
    type NotificationFrontend,
    type NotificationPreferenceFrontend,
} from "@/lib/actions/notifications";
import NotificationPreferencesDialog from "./NotificationPreferencesDialog";

interface Props {
    userId: string;
    initialNotifications: NotificationFrontend[];
    initialPreferences: NotificationPreferenceFrontend;
}

function getIcon(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("swap")) return "🔄";
    if (m.includes("drop") || m.includes("picked up")) return "📥";
    if (m.includes("assign") || m.includes("shift")) return "📅";
    if (m.includes("publish") || m.includes("schedule")) return "✅";
    if (m.includes("overtime") || m.includes("warning")) return "⚠️";
    if (m.includes("cancel")) return "❌";
    if (m.includes("approved") || m.includes("approve")) return "✅";
    if (m.includes("reject") || m.includes("declined")) return "🚫";
    if (m.includes("pickup") || m.includes("available")) return "📋";
    return "📬";
}

export default function NotificationsClient({
    userId,
    initialNotifications,
    initialPreferences,
}: Props) {
    const queryClient = useQueryClient();

    const [markingId, setMarkingId] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);
    const [prefsOpen, setPrefsOpen] = useState(false);

    const { data: notifications = [] } = useQuery<NotificationFrontend[]>({
        queryKey: ["notifications", userId],
        queryFn: () => getNotifications(userId),
        initialData: initialNotifications,
        refetchInterval: 30_000,
    });

    const { data: preferences } = useQuery<NotificationPreferenceFrontend>({
        queryKey: ["notificationPreferences", userId],
        queryFn: () => getNotificationPreferences(userId),
        initialData: initialPreferences,
    });

    const markReadMutation = useMutation({
        mutationFn: (notificationId: string) =>
            markNotificationRead(userId, notificationId),
        onSuccess: (res) => {
            setMarkingId(null);
            if (!res.success) {
                toast.error(res.error ?? "Failed to mark as read");
                return;
            }
            queryClient.invalidateQueries({
                queryKey: ["notifications", userId],
            });
        },
        onError: (err: Error) => {
            setMarkingId(null);
            toast.error(err.message);
        },
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => markAllNotificationsRead(userId),
        onSuccess: (res) => {
            setMarkingAll(false);
            if (!res.success) {
                toast.error(res.error ?? "Failed to mark all as read");
                return;
            }
            queryClient.invalidateQueries({
                queryKey: ["notifications", userId],
            });
        },
        onError: (err: Error) => {
            setMarkingAll(false);
            toast.error(err.message);
        },
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className="p-8 max-w-3xl space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Notifications</h1>
                    <p className="text-muted-foreground mt-1">
                        {unreadCount > 0
                            ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                            : "All caught up"}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setMarkingAll(true);
                                markAllReadMutation.mutate();
                            }}
                            disabled={markingAll}
                        >
                            {markingAll ? (
                                <ClipLoader size={16} color="#0E172B" />
                            ) : (
                                <>
                                    <CheckCheck className="w-4 h-4 mr-2" />
                                    Mark All Read
                                </>
                            )}
                        </Button>
                    )}

                    <Settings
                        className="w-6 h-6 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => setPrefsOpen(true)}
                    />
                </div>
            </div>

            {/* Notification list */}
            {notifications.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <BellOff className="w-12 h-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">
                            No notifications yet
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            You&apos;ll see notifications here when things
                            happen
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {notifications.map((notification) => {
                        const isMarking = markingId === notification.id;
                        return (
                            <Card
                                key={notification.id}
                                className={`transition-colors ${
                                    !notification.read
                                        ? "bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100"
                                        : "cursor-default"
                                }`}
                                onClick={() => {
                                    if (!notification.read && !isMarking) {
                                        setMarkingId(notification.id);
                                        markReadMutation.mutate(
                                            notification.id,
                                        );
                                    }
                                }}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="text-2xl shrink-0">
                                            {getIcon(notification.message)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {format(
                                                    new Date(
                                                        notification.createdAt,
                                                    ),
                                                    "MMM d, yyyy 'at' h:mm a",
                                                )}
                                            </p>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                            {isMarking ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                            ) : !notification.read ? (
                                                <Badge variant="default">
                                                    New
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Preferences dialog */}
            {preferences && (
                <NotificationPreferencesDialog
                    userId={userId}
                    preferences={preferences}
                    open={prefsOpen}
                    onOpenChange={setPrefsOpen}
                />
            )}
        </div>
    );
}
