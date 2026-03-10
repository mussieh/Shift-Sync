import { auth } from "@/auth";
import { ReactNode } from "react";
import { redirect } from "next/navigation";

type AdminRoutesLayoutProps = {
    children: ReactNode;
};

const AdminRoutesLayout = async ({ children }: AdminRoutesLayoutProps) => {
    const session = await auth();
    const isAdminOrManager =
        session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

    if (!isAdminOrManager) {
        redirect("/unauthorized");
    }

    return <>{children}</>;
};

export default AdminRoutesLayout;
