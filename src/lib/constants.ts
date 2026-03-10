import { ErrorState } from "@/types/ErrorState";

export const APP_NAME =
    process.env.NEXT_PUBLIC_APP_NAME ||
    "ShiftSync — Multi-Location Staff Scheduling Platform";
export const APP_DESCRIPTION =
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
    "ShiftSync is a web-based workforce scheduling platform designed for multi-location restaurants. It enables managers to efficiently create, assign, and publish shifts while ensuring compliance with labor rules, tracking overtime, and maintaining fair distribution of premium shifts. Staff can view schedules, request swaps or drops, and manage availability, with real-time updates and notifications. ShiftSync ensures operational visibility, reduces scheduling conflicts, and enhances team productivity across multiple locations and time zones.";
export const SERVER_URL =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

export const handleError = (
    error: unknown,
    defaultMessage: string,
): ErrorState => {
    return { success: false, message: defaultMessage };
};
