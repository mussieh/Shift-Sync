import { BroadcastType } from "@/types/BroadcastType";
import { createSupabaseServerClient } from "./serverClient";
import { RealtimeChannel } from "@supabase/supabase-js";

let broadcastChannel: RealtimeChannel | null = null;

export const sendBroadcast = async (event: BroadcastType, clientId: string) => {
    const supabase = await createSupabaseServerClient();

    if (!broadcastChannel) {
        broadcastChannel = supabase.channel("app-broadcast");
        broadcastChannel.subscribe();
    }

    await broadcastChannel.send({
        type: "broadcast",
        event,
        payload: { clientId },
    });
};
