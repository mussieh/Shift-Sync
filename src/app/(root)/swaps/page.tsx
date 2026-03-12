import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SwapsClient from "@/components/swaps/SwapsClient";
import { getSwapPageData, getAvailableDrops } from "@/lib/actions/swaps";
import { getUpcomingShiftsForUser } from "@/lib/actions/schedule";

export default async function SwapPage() {
    const session = await auth();

    // Fail safe — never crash with a non-null assertion on session
    if (!session?.user?.id) {
        redirect("/login");
    }

    const { id: userId, role } = session.user;
    const isStaff = role === "STAFF";

    // Fetch in parallel; avoid wasted queries for roles that don't need the data
    const [swaps, myShifts, availableDrops] = await Promise.all([
        getSwapPageData(userId),
        isStaff ? getUpcomingShiftsForUser(userId) : Promise.resolve([]),
        isStaff ? getAvailableDrops(userId) : Promise.resolve([]),
    ]);

    return (
        <SwapsClient
            currentUser={{ id: userId, role }}
            initialSwaps={swaps}
            initialMyShifts={myShifts}
            initialAvailableDrops={availableDrops}
        />
    );
}
