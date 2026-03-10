import type { Metadata } from "next";
import localFont from "next/font/local";
import "@/styles/globals.css";
import { APP_DESCRIPTION, APP_NAME, SERVER_URL } from "@/lib/constants";
import clsx from "clsx";
import { Toaster } from "sonner";
import { SessionProvider } from "next-auth/react";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";

const inter = localFont({
    src: [
        {
            path: "../../public/fonts/Inter-VariableFont_opsz,wght.ttf",
            weight: "100 900", // range for variable font
        },
    ],
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        template: `%s | ${APP_NAME}`,
        default: APP_NAME,
    },
    description: APP_DESCRIPTION,
    metadataBase: new URL(SERVER_URL),
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={clsx(`${inter.className} antialiased`)}>
            <body className={clsx(`${inter.className} antialiased`)}>
                <SessionProvider>
                    <ReactQueryProvider>{children}</ReactQueryProvider>
                </SessionProvider>
                <Toaster richColors position="top-center" />
            </body>
        </html>
    );
}
