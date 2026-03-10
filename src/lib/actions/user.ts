"use server";

import { signIn } from "@/auth";
import { handleError } from "../constants";
import { loginSchema } from "../schemas/auth";
import { ErrorState } from "@/types/ErrorState";
import { prisma } from "../db/prisma";

export async function signInWithCredentials(
    prevState: ErrorState,
    formData: FormData,
): Promise<ErrorState> {
    try {
        const credentials = loginSchema.parse({
            email: formData.get("email"),
            password: formData.get("password"),
        });

        // 1️⃣ Find the user first
        const user = await prisma.user.findUnique({
            where: { email: credentials.email },
        });

        if (!user) {
            return { success: false, message: "Invalid email or password" };
        }

        // 3️⃣ Proceed to sign in
        const result = await signIn("credentials", {
            ...credentials,
            redirect: false,
        });

        if (result?.error) {
            return { success: false, message: result.error };
        }

        return { success: true, message: "Signed in successfully" };
    } catch (error) {
        return handleError(error, "Invalid email or password");
    }
}
