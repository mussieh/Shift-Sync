"use client";

import clsx from "clsx";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

type SidebarItemProps = {
    route: string;
    icon: ReactNode;
};

const SidebarItem = ({ route, icon }: SidebarItemProps) => {
    const pathname = usePathname();

    const pageName = route.slice(1).charAt(0).toUpperCase() + route.slice(2);
    const isOnPage = pathname.startsWith(route);

    return (
        <div
            className={clsx(
                "flex gap-2 items-center p-3.5 rounded-2xl cursor-pointer",
                isOnPage && "bg-[#1C293D] text-white",
            )}
        >
            {icon}
            <p className="text-h4">{pageName}</p>
        </div>
    );
};

export default SidebarItem;
