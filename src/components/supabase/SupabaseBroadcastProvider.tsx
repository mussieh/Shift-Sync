"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { BroadcastType } from "@/types/BroadcastType";
import { useSilentUpdateStore } from "@/store/silentUpdateStore";
import { getClientId } from "@/lib/utils/clientId";

const SupabaseBroadcastProvider = () => {
    const queryClient = useQueryClient();
    const supabase = useRef(createSupabaseBrowserClient()).current;
    const channelRef = useRef<RealtimeChannel | null>(null);
    const { setSuppressSpinner } = useSilentUpdateStore.getState();

    const handleQueryRefetch = useCallback(
        (queryKeys: string[]) => {
            setSuppressSpinner(true);

            queryClient
                .refetchQueries({
                    predicate: (query) =>
                        queryKeys.includes(query.queryKey[0] as string),
                })
                .finally(() => {
                    setTimeout(() => setSuppressSpinner(false), 100);
                });
        },
        [queryClient, setSuppressSpinner],
    );

    const subscribeToChannel = useCallback(() => {
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
        }

        const channel = supabase.channel("app-broadcast");

        channel
            .on("broadcast", { event: "*" }, async (payload) => {
                const event = payload.event as BroadcastType;
                const fromClientId = payload.payload?.clientId;
                const thisClientId = getClientId();

                if (fromClientId === thisClientId) return;

                switch (event) {
                    case BroadcastType.SHIFT_CREATED:
                    case BroadcastType.SHIFT_DELETED:
                    case BroadcastType.SHIFT_UPDATED:
                    case BroadcastType.SHIFT_PUBLISHED:
                    case BroadcastType.SHIFT_UNPUBLISHED:
                    case BroadcastType.ASSIGNMENT_ADDED:
                    case BroadcastType.ASSIGNMENT_UPDATED:
                    case BroadcastType.ASSIGNMENT_REMOVED:
                        handleQueryRefetch(["weekShifts", "myUpcomingShifts"]);
                        break;
                    case BroadcastType.SWAP_REQUEST_CREATED:
                    case BroadcastType.SWAP_REQUEST_ACCEPTED:
                    case BroadcastType.SWAP_REQUEST_APPROVED:
                    case BroadcastType.SWAP_REQUEST_REJECTED:
                    case BroadcastType.SWAP_REQUEST_CANCELLED:
                    case BroadcastType.DROP_REQUEST_CREATED:
                    case BroadcastType.DROP_REQUEST_CLAIMED:
                    case BroadcastType.DROP_REQUEST_UPDATED:
                    case BroadcastType.DROP_REQUEST_CANCELLED:
                        handleQueryRefetch([
                            "swapRequests",
                            "myUpcomingShifts",
                            "availableDrops",
                        ]);
                        break;
                    default:
                        console.warn("Unhandled broadcast event:", event);
                        break;
                }
            })
            .subscribe();

        channelRef.current = channel;
    }, [handleQueryRefetch, supabase]);

    useEffect(() => {
        subscribeToChannel();

        const handleReconnect = () => {
            subscribeToChannel();
        };

        // Resubscribe when tab regains focus or goes online
        window.addEventListener("online", handleReconnect);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                handleReconnect();
            }
        });

        return () => {
            window.removeEventListener("online", handleReconnect);
            document.removeEventListener("visibilitychange", handleReconnect);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [queryClient, subscribeToChannel, supabase]);

    return null;
};

export default SupabaseBroadcastProvider;
