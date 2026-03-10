"use client";

import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/schemas/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import { signInWithCredentials } from "@/lib/actions/user";
import { ClipLoader } from "react-spinners";
import { useRouter } from "next/navigation";

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginForm = () => {
    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });
    const router = useRouter();
    const [data, action, pending] = useActionState(signInWithCredentials, {
        message: "",
        success: false,
    });

    useEffect(() => {
        if (data.success) {
            router.replace("/dashboard");
        } else {
            if (data.message) {
                toast.error(data.message);
            }
        }
    }, [data, router]);

    const onSubmit = (formData: LoginFormValues) => {
        const form = new FormData();
        form.append("email", formData.email);
        form.append("password", formData.password);

        startTransition(() => {
            action(form);
        });
    };

    return (
        <section className="flex flex-col items-center p-6">
            <Image
                src="/images/zemastudent-logo.png"
                alt="Zema Student Logo"
                width={233}
                height={26}
                className="mb-14"
            />
            <h1 className="text-h1 text-black">Get Started Now</h1>
            <p className="text-body-primary text-black mt-2.5 mb-5 text-center">
                Enter your credentials to login to your account
            </p>
            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6 max-w-md w-full mt-10"
                >
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-h4">
                                    Email Address
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        type="email"
                                        className="text-h4 p-6"
                                        autoComplete="email"
                                        placeholder="example@mail.com"
                                        {...field}
                                    />
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
                                <FormLabel className="text-h4">
                                    Password
                                </FormLabel>
                                <FormControl>
                                    <PasswordInput
                                        className="text-h4 p-6"
                                        autoComplete="current-password"
                                        placeholder="Enter your password"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Link
                        className="font-semibold text-base text-custom-primary flex justify-end"
                        href="/forgot-password"
                    >
                        Forgot Password?
                    </Link>

                    <Button
                        disabled={pending}
                        className="w-full text-xl cursor-pointer font-semibold text-white p-6"
                        type="submit"
                    >
                        {pending ? (
                            <ClipLoader color="#fff" size={20} />
                        ) : (
                            "Login"
                        )}
                    </Button>

                    <p className="text-center">
                        Don&apos;t have an account?{" "}
                        <Link
                            className="font-semibold text-base text-custom-primary"
                            href="/signup"
                        >
                            Signup
                        </Link>
                    </p>
                </form>
            </Form>
        </section>
    );
};

export default LoginForm;
