"use client";

import { useEffect, useState } from "react";
import {
    Card,
    CardHeader,
    CardContent,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
    assignments: {
        user: { firstName: string; lastName: string };
        shift: { startTime: Date; endTime: Date; location: { name: string } };
        location: { name: string };
    }[];
};

export default function OnDutyWidget({ assignments }: Props) {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Currently On Duty</CardTitle>
                <CardDescription>
                    Staff working right now (updates every 30s)
                </CardDescription>
            </CardHeader>
            <CardContent>
                {assignments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No staff currently on duty
                    </p>
                ) : (
                    <div className="space-y-3">
                        {assignments.map((a, i) => (
                            <div
                                key={i}
                                className="flex justify-between items-center p-3 border rounded-lg"
                            >
                                <div>
                                    <p className="font-medium">
                                        {a.user.firstName} {a.user.lastName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {a.location.name} •{" "}
                                        {new Date(
                                            a.shift.startTime,
                                        ).toLocaleTimeString()}{" "}
                                        -{" "}
                                        {new Date(
                                            a.shift.endTime,
                                        ).toLocaleTimeString()}
                                    </p>
                                </div>
                                <Badge variant="outline">On Duty</Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
