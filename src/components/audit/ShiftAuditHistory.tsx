"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipLoader } from "react-spinners";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
    getShiftAuditHistory,
    type AuditLogFrontend,
} from "@/lib/actions/audit";

interface Props {
    shiftId: string;
}

const actionVariant = (
    action: string,
): "default" | "secondary" | "destructive" | "outline" => {
    switch (action) {
        case "CREATE":
        case "ASSIGN":
        case "PUBLISH":
        case "APPROVE":
            return "default";
        case "REMOVE":
        case "REJECT":
        case "CANCEL":
        case "AUTO_CANCEL":
        case "UNPUBLISH":
            return "destructive";
        case "ACCEPT":
        case "DECLINE":
            return "secondary";
        default:
            return "outline";
    }
};

export default function ShiftAuditHistory({ shiftId }: Props) {
    const { data: logs = [], isLoading } = useQuery<AuditLogFrontend[]>({
        queryKey: ["shiftAuditHistory", shiftId],
        queryFn: () => getShiftAuditHistory(shiftId),
        staleTime: 30_000,
    });

    if (isLoading) {
        return (
            <div className="flex justify-center py-6">
                <ClipLoader size={20} />
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
                <History className="w-8 h-8 mb-2" />
                <p className="text-sm">No history yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {logs.map((log) => (
                <div key={log.id} className="flex gap-3">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-border mt-1.5 shrink-0" />
                        <div className="w-px flex-1 bg-border mt-1" />
                    </div>

                    <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <Badge
                                variant={actionVariant(log.action)}
                                className="text-xs"
                            >
                                {log.action}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {log.performedBy
                                    ? `${log.performedBy.firstName} ${log.performedBy.lastName}`
                                    : "System"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(
                                new Date(log.createdAt),
                                "MMM d, yyyy 'at' h:mm a",
                            )}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
