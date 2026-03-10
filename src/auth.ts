import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcrypt-ts-edge";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/schemas/auth";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials) return null;

                const parsed = loginSchema.safeParse(credentials);
                if (!parsed.success) return null;

                const { email, password, role } = parsed.data;

                const user = await prisma.user.findUnique({
                    where: { email },
                });

                if (!user) return null;

                // role validation
                if (user.role !== role) return null;

                const isValid = compareSync(password, user.password);
                if (!isValid) return null;

                return {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    desiredHours: user.desiredHours ?? undefined,
                };
            },
        }),
    ],
});
