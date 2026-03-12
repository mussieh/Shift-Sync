"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Bell } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import {
    updateNotificationPreferences,
    type NotificationPreferenceFrontend,
} from "@/lib/actions/notifications";

interface Props {
    userId: string;
    preferences: NotificationPreferenceFrontend;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function NotificationPreferencesDialog({
    userId,
    preferences,
    open,
    onOpenChange,
}: Props) {
    const queryClient = useQueryClient();

    const updatePrefsMutation = useMutation({
        mutationFn: (prefs: NotificationPreferenceFrontend) =>
            updateNotificationPreferences(userId, prefs),
        onSuccess: (res) => {
            if (!res.success) {
                toast.error(res.error ?? "Failed to update preferences");
                return;
            }
            toast.success("Preferences saved");
            queryClient.invalidateQueries({
                queryKey: ["notificationPreferences", userId],
            });
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const handleToggle = (
        key: keyof NotificationPreferenceFrontend,
        value: boolean,
    ) => {
        updatePrefsMutation.mutate({ ...preferences, [key]: value });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Notification Preferences</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Bell className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                                <Label className="text-sm font-medium">
                                    In-app notifications
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Show notifications inside the app
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={preferences.inAppEnabled}
                            onCheckedChange={(val) =>
                                handleToggle("inAppEnabled", val)
                            }
                            disabled={updatePrefsMutation.isPending}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                                <Label className="text-sm font-medium">
                                    Email notifications
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Receive a copy via email
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={preferences.emailEnabled}
                            onCheckedChange={(val) =>
                                handleToggle("emailEnabled", val)
                            }
                            disabled={updatePrefsMutation.isPending}
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
