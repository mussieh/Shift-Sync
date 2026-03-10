"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function ClientSessionRefresher() {
    const { status, update } = useSession();

    // 1️⃣ Refresh session if unauthenticated immediately
    useEffect(() => {
        if (status === "unauthenticated") {
            update();
        }
    }, [status, update]);

    return null; // no UI needed
}
