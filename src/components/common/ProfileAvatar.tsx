"use client";

import clsx from "clsx";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

type ProfileAvatarProps = {
    style?: string;
};

const roleLabels: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Manager",
    STAFF: "Staff",
};

const ProfileAvatar = ({ style = "" }: ProfileAvatarProps) => {
    const { data: session } = useSession();
    const [menuVisible, setMenuVisible] = useState(false);

    const userName = session?.user?.firstName ?? "U";
    const userRole = session?.user?.role ?? "STAFF";
    const roleLabel = roleLabels[userRole] ?? "Staff";
    const userEmail = session?.user?.email ?? "";

    return (
        <div className={clsx("relative", style)}>
            {/* Avatar Circle */}
            <div
                onClick={() => setMenuVisible((prev) => !prev)}
                className="w-15 h-15 text-black bg-[#F9FAFC] flex justify-center items-center rounded-full cursor-pointer"
            >
                <p className="text-2xl font-semibold">
                    {userName.charAt(0).toUpperCase()}
                </p>
            </div>

            {/* Dropdown Menu */}
            <div
                className={clsx(
                    "bg-white rounded-2xl absolute right-0 p-5 w-78.5 hidden shadow-lg",
                    menuVisible ? "md:block" : "md:hidden",
                )}
            >
                <p className="text-xl font-semibold">{userName}</p>
                <hr className="border-[#E1E3E6] my-3" />

                <p className="text-lg font-medium text-[#68778D]">
                    Account Type: {roleLabel}
                </p>

                <p
                    title={userEmail}
                    className="text-lg font-medium text-[#68778D] mb-5 truncate"
                >
                    {userEmail}
                </p>

                <div
                    onClick={() => signOut()}
                    className="flex gap-2 justify-center items-center cursor-pointer"
                >
                    <p className="text-lg font-medium">Logout</p>
                    <LogOut />
                </div>
            </div>
        </div>
    );
};

export default ProfileAvatar;
