import { prisma } from "@/lib/db/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60,
    },
    cookies: {
        sessionToken: {
            name:
                process.env.NODE_ENV === "production"
                    ? "__Secure-next-auth.session-token"
                    : "next-auth.session-token",
            options: {
                httpOnly: true,
                sameSite: "lax" as const,
                path: "/",
                secure: process.env.NODE_ENV === "production",
            },
        },
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id as string;
                token.email = user.email as string;
                token.role = user.role;
                token.firstName = user.firstName;
                token.lastName = user.lastName;
                token.desiredHours = user.desiredHours;
            }

            if (!token.id) return token;

            const dbUser = await prisma.user.findUnique({
                where: { id: String(token.id) }, // ✅ force string, eliminates {}  ambiguity
                select: { id: true },
            });

            if (!dbUser) return null;

            return token;
        },
        async session({ session, token }) {
            if (!token?.id)
                return {
                    ...session,
                    user: undefined,
                } as unknown as typeof session;

            session.user = {
                ...session.user, // ✅ spread base user (keeps name/image from DefaultSession)
                id: String(token.id), // ✅ force string
                email: String(token.email), // ✅ force string
                role: token.role as "ADMIN" | "MANAGER" | "STAFF", // ✅ cast optional to required
                firstName: String(token.firstName), // ✅ force string
                lastName: String(token.lastName), // ✅ force string
                desiredHours:
                    typeof token.desiredHours === "number"
                        ? token.desiredHours
                        : undefined,
                emailVerified: null,
            };

            return session;
        },
    },
    adapter: PrismaAdapter(prisma) as Adapter, // cast to resolve bundled @auth/core version mismatch
    providers: [],
} satisfies NextAuthConfig;
