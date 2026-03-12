import { auth } from "@/auth";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import Sidebar from "@/components/common/Sidebar";
import Topbar from "@/components/common/Topbar";
import ClientSessionRefresher from "@/components/auth/ClientSessionRefresher";
import SupabaseBroadcastProvider from "@/components/supabase/SupabaseBroadcastProvider";

type ProtectedRoutesLayoutProps = {
    children: ReactNode;
};

const ProtectedRoutesLayout = async ({
    children,
}: ProtectedRoutesLayoutProps) => {
    const session = await auth();
    const isAdminOrManager =
        session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

    if (!session?.user) {
        return redirect("/login");
    }

    return (
        <>
            <SupabaseBroadcastProvider />
            <ClientSessionRefresher />
            <Topbar />
            <main className="flex w-screen h-[calc(100vh-6rem)] bg-[#F9FAFC]">
                <Sidebar isAdminOrManager={isAdminOrManager} />
                <section className="flex-1 overflow-y-auto p-8">
                    {children}
                </section>
            </main>
        </>
    );
};

export default ProtectedRoutesLayout;
