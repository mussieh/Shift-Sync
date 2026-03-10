import type { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            email: string;
            role: "ADMIN" | "MANAGER" | "STAFF";
            firstName: string;
            lastName: string;
            desiredHours?: number;
            emailVerified: boolean | null;
            managedLocations?: string[];
        } & DefaultSession["user"];
    }

    interface User {
        id: string;
        email: string;
        role: "ADMIN" | "MANAGER" | "STAFF";
        firstName: string;
        lastName: string;
        desiredHours?: number;
        managedLocations?: string[];
    }
}

// JWT must be augmented in its own module
declare module "next-auth/jwt" {
    interface JWT {
        id?: string; // ✅ optional to match base JWT type
        email?: string;
        role?: "ADMIN" | "MANAGER" | "STAFF";
        firstName?: string;
        lastName?: string;
        desiredHours?: number;
        managedLocations?: string[];
    }
}
