"use client";

import { useSidebarStore } from "@/store/sidebarStore";
import Image from "next/image";

import ProfileAvatar from "./ProfileAvatar";
import { Menu, X } from "lucide-react";
import Link from "next/link";

const Topbar = () => {
    const { isOpen, toggle } = useSidebarStore();

    return (
        <header className="sticky top-0 z-50 w-full h-24 border-b-2 border-b-[#cfd8ed] bg-[#0E172B] p-6 flex gap-8 md:justify-between items-center">
            <div>
                <Link className="flex gap-4" href="/dashboard">
                    <h1 className="text-2xl font-semibold hidden md:block text-white">
                        ShiftSync
                    </h1>
                    <Image
                        className="hidden md:block"
                        width={30}
                        height={30}
                        src={"/images/logo.png"}
                        alt="ShiftSync Logo"
                        priority
                    />
                </Link>
                <button
                    onClick={() => toggle()}
                    className="md:hidden cursor-pointer"
                >
                    {isOpen ? (
                        <X size={30} color="#48566A" />
                    ) : (
                        <Menu size={30} color="#48566A" />
                    )}
                </button>
            </div>
            <div className="w-full md:w-fit flex gap-10 items-center">
                <div className="hidden md:block">
                    {/* <NotificationBell /> */}
                </div>

                <ProfileAvatar style="hidden md:block" />
            </div>
        </header>
    );
};

export default Topbar;
