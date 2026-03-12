"use client";

import { adminManagerOnlyRoutes, protectedRoutes } from "@/proxy";
import {
    Bell,
    Calendar,
    LayoutDashboard,
    Users,
    ClipboardList,
    FileText,
    ChartBarBig,
    LocationEdit,
    PanelRightOpen,
    PanelRightClose,
} from "lucide-react";
import clsx from "clsx";
import Image from "next/image";
import { JSX } from "react";
import SidebarItem from "./SidebarItem";
import { useSidebarStore } from "@/store/sidebarStore";
import ProfileAvatar from "./ProfileAvatar";
import Link from "next/link";

const sidebarIcons: { [key: string]: JSX.Element } = {
    "/dashboard": <LayoutDashboard size={18} />,
    "/schedule": <Calendar size={18} />,
    "/swaps": <ClipboardList size={18} />,
    "/analytics": <ChartBarBig size={18} />,
    "/notifications": <Bell size={18} />,
    "/audit": <FileText size={18} />,
};

type SidebarProps = {
    isAdminOrManager: boolean;
};

const Sidebar = ({ isAdminOrManager }: SidebarProps) => {
    const { isOpen, toggle } = useSidebarStore();

    return (
        <aside
            className={clsx(
                "relative w-full",
                isOpen ? "max-w-0 md:max-w-64" : "max-w-0",
            )}
        >
            {/* Sidebar toggle button */}
            <div
                className={clsx(
                    "absolute md:flex hidden z-50 transition-all duration-300 ease-in-out",
                    isOpen ? "top-60 left-60" : "top-[90%] left-10",
                )}
            >
                <button
                    onClick={() => toggle()}
                    className="p-2 rounded-full bg-white shadow-md cursor-pointer border hover:bg-gray-100 transition"
                >
                    {isOpen ? (
                        <PanelRightOpen size={24} />
                    ) : (
                        <PanelRightClose size={24} />
                    )}
                </button>
            </div>

            {/* Sidebar */}
            <div
                className={clsx(
                    "h-full absolute z-50 md:static overflow-y-auto bg-[#0E172B] shadow-md w-64 transform transition-transform duration-300 ease-in-out text-white",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                )}
            >
                <div className="p-6 flex flex-col gap-3">
                    <div className="px-4 py-6 block md:hidden">
                        <Link className="flex gap-4" href="/dashboard">
                            <h1 className="text-2xl font-semibold">
                                ShiftSync
                            </h1>
                            <Image
                                className="md:hidden"
                                width={30}
                                height={30}
                                src={"/images/logo.png"}
                                alt="ShiftSync Logo"
                                priority
                            />
                        </Link>
                    </div>
                    {protectedRoutes.map((route) => {
                        if (
                            isAdminOrManager ||
                            !adminManagerOnlyRoutes.includes(route)
                        ) {
                            return (
                                <Link key={route} href={route}>
                                    <SidebarItem
                                        icon={sidebarIcons[route]}
                                        route={route}
                                    />
                                </Link>
                            );
                        }
                    })}
                    <hr className="border-[#E3E8F0] my-4 md:hidden" />
                    <div className="flex gap-12 justify-center items-center">
                        <div className="md:hidden">
                            {/* <NotificationBell /> */}
                        </div>

                        <ProfileAvatar style="md:hidden" />
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
