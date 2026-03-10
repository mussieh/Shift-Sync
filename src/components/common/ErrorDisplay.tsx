"use client";

import Image from "next/image";
import Link from "next/link";

interface ErrorDisplayProps {
    errorMessage?: string;
    onRetry?: () => void;
    size?: "small" | "medium" | "large"; // example sizing variants
    className?: string;
}

export default function ErrorDisplay({
    errorMessage = "We encountered an unexpected error. Please try again or go back.",
    onRetry,
    size = "medium",
    className = "",
}: ErrorDisplayProps) {
    const sizes = {
        small: 150,
        medium: 300,
        large: 450,
    };

    const imgSize = sizes[size] ?? sizes.medium;

    return (
        <div
            className={`flex flex-col items-center justify-center bg-white p-10 text-center gap-4 ${className}`}
        >
            <Image
                className="rounded-2xl"
                src="/images/error.jpg"
                alt="Error illustration"
                width={imgSize}
                height={imgSize}
                priority
            />
            <h1 className="text-4xl font-bold text-red-600 mb-4">
                Something went wrong
            </h1>
            <p className="text-lg text-gray-700 mb-6">{errorMessage}</p>
            <div className="flex gap-4">
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="rounded-lg cursor-pointer bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition"
                    >
                        Try Again
                    </button>
                )}
                <Link
                    href="/"
                    className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-100 transition"
                >
                    Go Home
                </Link>
            </div>
        </div>
    );
}
