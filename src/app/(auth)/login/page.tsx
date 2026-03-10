import { auth } from "@/auth";

import { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Login",
};

const LoginPage = async () => {
    const session = await auth();

    if (session?.user) {
        return redirect("/dashboard");
    }
};

export default LoginPage;
