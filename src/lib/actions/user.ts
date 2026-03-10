"use server";

import { prisma } from "@/lib/db/prisma";
import { auth, signIn } from "@/auth";
import { z } from "zod";
import { loginSchema } from "../schemas/auth";
import { ErrorState } from "@/types/ErrorState";

export async function signInWithCredentials(
    prevState: ErrorState,
    formData: FormData,
) {
    try {
        const data = loginSchema.parse({
            email: formData.get("email"),
            password: formData.get("password"),
            role: formData.get("role"),
        });

        const user = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (!user) {
            return { success: false, message: "User not found" };
        }

        if (user.role !== data.role) {
            return {
                success: false,
                message: `This account is not a ${data.role}`,
            };
        }

        const result = await signIn("credentials", {
            email: data.email,
            password: data.password,
            role: data.role,
            redirect: false,
        });

        if (result?.error) {
            return { success: false, message: result.error };
        }

        return { success: true, message: "Login successful" };
    } catch {
        return { success: false, message: "Invalid credentials" };
    }
}

export async function requireAuth() {
    const session = await auth();
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }

    return session.user;
}
