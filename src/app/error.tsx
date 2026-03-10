"use client";

import ErrorDisplay from "@/components/common/ErrorDisplay";
import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error;
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex justify-center items-center h-screen">
            <ErrorDisplay onRetry={reset} />
        </div>
    );
}
