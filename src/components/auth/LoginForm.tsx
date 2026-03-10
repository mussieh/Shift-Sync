"use client";

import { useState, startTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

import { ClipLoader } from "react-spinners";
import { loginSchema } from "@/lib/schemas/auth";
import { signInWithCredentials } from "@/lib/actions/user";
import clsx from "clsx";

type LoginFormValues = z.infer<typeof loginSchema>;

const demoAccounts = {
    ADMIN: "admin@coastaleats.com",
    MANAGER: "manager.la@coastaleats.com",
    STAFF: "staff1@coastaleats.com",
};

export default function LoginForm() {
    const router = useRouter();

    const [selectedRole, setSelectedRole] = useState<
        "ADMIN" | "MANAGER" | "STAFF" | null
    >(null);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "password123",
            role: "STAFF",
        },
    });

    const [data, action, pending] = useActionState(signInWithCredentials, {
        success: false,
        message: "",
    });

    useEffect(() => {
        if (data.success) {
            router.replace("/dashboard");
        } else if (data.message) {
            toast.error(data.message);
        }
    }, [data, router]);

    function selectRole(role: "ADMIN" | "MANAGER" | "STAFF") {
        setSelectedRole(role);

        form.setValue("role", role);
        form.setValue("email", demoAccounts[role]);
    }

    function onSubmit(values: LoginFormValues) {
        const fd = new FormData();

        fd.append("email", values.email);
        fd.append("password", values.password);
        fd.append("role", values.role);

        startTransition(() => {
            action(fd);
        });
    }

    return (
        <div className="flex justify-center items-center h-screen bg-[#121C31]">
            <Card className="w-105">
                <CardHeader>
                    <CardTitle className="text-xl">ShiftSync Login</CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Role Selector */}

                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Select a role to continue
                        </p>

                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                type="button"
                                className={clsx(
                                    "border border-[#121C32]",
                                    selectedRole === "ADMIN"
                                        ? "bg-[#121C32] text-white"
                                        : "bg-white text-black",
                                )}
                                onClick={() => selectRole("ADMIN")}
                            >
                                Admin
                            </Button>

                            <Button
                                type="button"
                                className={clsx(
                                    "border border-[#121C32]",
                                    selectedRole === "MANAGER"
                                        ? "bg-[#121C32] text-white"
                                        : "bg-white text-black",
                                )}
                                onClick={() => selectRole("MANAGER")}
                            >
                                Manager
                            </Button>

                            <Button
                                type="button"
                                className={clsx(
                                    "border border-[#121C32]",
                                    selectedRole === "STAFF"
                                        ? "bg-[#121C32] text-white"
                                        : "bg-white text-black",
                                )}
                                onClick={() => selectRole("STAFF")}
                            >
                                Staff
                            </Button>
                        </div>
                    </div>

                    {/* Login Form */}

                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-4"
                        >
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>

                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>

                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>

                                        <FormControl>
                                            <Input type="password" {...field} />
                                        </FormControl>

                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button
                                className="w-full bg-[#121C32]"
                                disabled={pending}
                                type="submit"
                            >
                                {pending ? (
                                    <ClipLoader size={16} color="#fff" />
                                ) : (
                                    "Login"
                                )}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
