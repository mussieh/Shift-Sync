import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SwapsClient from "@/components/swaps/SwapsClient";
import { getSwapPageData, getAvailableDrops } from "@/lib/actions/swaps";
import { getUpcomingShiftsForUser } from "@/lib/actions/schedule";

export default async function SwapPage() {
    const session = await auth();

    // Fail safe — redirect if not logged in
    if (!session?.user?.id) {
        redirect("/login");
    }

    const { id: userId, role } = session.user;
    const isStaff = role === "STAFF";

    // Use Promise.allSettled to avoid crashing if one fetch fails
    const results = await Promise.allSettled([
        getSwapPageData(userId),
        isStaff ? getUpcomingShiftsForUser(userId) : Promise.resolve([]),
        isStaff ? getAvailableDrops(userId) : Promise.resolve([]),
    ]);

    // Extract results safely
    const swaps = results[0].status === "fulfilled" ? results[0].value : [];
    const myShifts = results[1].status === "fulfilled" ? results[1].value : [];
    const availableDrops =
        results[2].status === "fulfilled" ? results[2].value : [];

    return (
        <SwapsClient
            currentUser={{ id: userId, role }}
            initialSwaps={swaps}
            initialMyShifts={myShifts}
            initialAvailableDrops={availableDrops}
        />
    );
}
