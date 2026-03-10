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
        /**
         * JWT CALLBACK
         */
        async jwt({ token, user }) {
            // First login
            if (user) {
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        managedLocations: {
                            select: { id: true },
                        },
                    },
                });

                if (!dbUser) return token;

                token.id = dbUser.id;
                token.email = dbUser.email;
                token.role = dbUser.role;
                token.firstName = dbUser.firstName;
                token.lastName = dbUser.lastName;
                token.desiredHours = dbUser.desiredHours ?? undefined;

                token.managedLocations = dbUser.managedLocations.map(
                    (l) => l.id,
                );
            }

            return token;
        },

        /**
         * SESSION CALLBACK
         */
        async session({ session, token }) {
            if (!token?.id) return session;

            session.user = {
                ...session.user,
                id: String(token.id),
                email: String(token.email),
                role: token.role as "ADMIN" | "MANAGER" | "STAFF",
                firstName: String(token.firstName),
                lastName: String(token.lastName),
                desiredHours:
                    typeof token.desiredHours === "number"
                        ? token.desiredHours
                        : undefined,
                emailVerified: null,
                managedLocations: (token.managedLocations as string[]) ?? [],
            };

            return session;
        },
    },

    adapter: PrismaAdapter(prisma) as Adapter,
    providers: [],
} satisfies NextAuthConfig;
