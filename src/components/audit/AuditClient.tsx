"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { ClipLoader } from "react-spinners";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    getAuditLogs,
    exportAuditLogsCsv,
    type AuditLogFilters,
    type AuditLogsPage,
} from "@/lib/actions/audit";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

interface Props {
    initialPage: AuditLogsPage;
    entityTypes: string[];
    locations: { id: string; name: string }[];
    isAdmin: boolean;
}

interface AuditLog {
    id: string;
    entityType: string;
    action: string;
    entityId: string;
    performedBy?: { firstName: string; lastName: string; role: string };
    createdAt: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
}

/* -------------------------------------------------------------------------- */
/*                            ACTION BADGE COLOUR                             */
/* -------------------------------------------------------------------------- */

const actionVariant = (
    action: string,
): "default" | "secondary" | "destructive" | "outline" => {
    switch (action) {
        case "CREATE":
        case "ASSIGN":
        case "PUBLISH":
        case "APPROVE":
        case "CLAIM":
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

/* -------------------------------------------------------------------------- */
/*                                 COMPONENT                                  */
/* -------------------------------------------------------------------------- */

export default function AuditClient({
    initialPage,
    entityTypes,
    locations,
    isAdmin,
}: Props) {
    // Filters
    const [entityTypeFilter, setEntityTypeFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Pagination
    const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
        undefined,
    ]);
    const [pageIndex, setPageIndex] = useState(0);
    const currentCursor = cursorStack[pageIndex];

    const [exporting, setExporting] = useState(false);

    /* ---------------------------------------------------------------------- */
    /*                          ACTIVE FILTERS                                */
    /* ---------------------------------------------------------------------- */

    const activeFilters: AuditLogFilters = {
        ...(entityTypeFilter !== "all" && { entityType: entityTypeFilter }),
        ...(locationFilter !== "all" && { locationId: locationFilter }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
    };

    const filtersKey = JSON.stringify(activeFilters);

    /* ---------------------------------------------------------------------- */
    /*                                 QUERY                                  */
    /* ---------------------------------------------------------------------- */

    const { data: page, isFetching } = useQuery<AuditLogsPage>({
        queryKey: ["auditLogs", filtersKey, currentCursor],
        queryFn: () => getAuditLogs(activeFilters, currentCursor),
        initialData:
            pageIndex === 0 && filtersKey === "{}" ? initialPage : undefined,
        staleTime: 30_000,
    });

    const logs: AuditLog[] =
        page?.logs.map((log) => ({
            ...log,
            performedBy: log.performedBy ?? undefined,
            before: log.before ? (log.before as Record<string, unknown>) : null,
            after: log.after ? (log.after as Record<string, unknown>) : null,
        })) ?? [];
    const nextCursor = page?.nextCursor ?? null;
    const total = page?.total ?? 0;
    const pageStart = pageIndex * 25 + 1;
    const pageEnd = Math.min(pageStart + logs.length - 1, total);

    /* ---------------------------------------------------------------------- */
    /*                          FILTER HANDLERS                               */
    /* ---------------------------------------------------------------------- */

    const resetPagination = useCallback(() => {
        setCursorStack([undefined]);
        setPageIndex(0);
    }, []);

    const handleEntityTypeChange = (val: string) => {
        setEntityTypeFilter(val);
        resetPagination();
    };

    const handleLocationChange = (val: string) => {
        setLocationFilter(val);
        resetPagination();
    };

    const handleDateFromChange = (val: string) => {
        setDateFrom(val);
        resetPagination();
    };

    const handleDateToChange = (val: string) => {
        setDateTo(val);
        resetPagination();
    };

    /* ---------------------------------------------------------------------- */
    /*                        PAGINATION HANDLERS                             */
    /* ---------------------------------------------------------------------- */

    const goNext = () => {
        if (!nextCursor) return;
        const newStack = [...cursorStack.slice(0, pageIndex + 1), nextCursor];
        setCursorStack(newStack);
        setPageIndex(pageIndex + 1);
    };

    const goPrev = () => {
        if (pageIndex === 0) return;
        setPageIndex(pageIndex - 1);
    };

    /* ---------------------------------------------------------------------- */
    /*                            CSV EXPORT                                  */
    /* ---------------------------------------------------------------------- */

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await exportAuditLogsCsv(activeFilters);
            if (!res.success || !res.csv) {
                toast.error(res.error ?? "Export failed");
                return;
            }

            const blob = new Blob([res.csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const timestamp = format(new Date(), "yyyy-MM-dd");
            a.download = `audit-log-${timestamp}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Export downloaded");
        } catch {
            toast.error("Export failed");
        } finally {
            setExporting(false);
        }
    };

    /* ---------------------------------------------------------------------- */
    /*                                RENDER                                  */
    /* ---------------------------------------------------------------------- */

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Audit Log</h1>
                    <p className="text-muted-foreground mt-1">
                        Complete history of all system changes
                    </p>
                </div>

                {isAdmin && (
                    <Button
                        variant="outline"
                        onClick={handleExport}
                        disabled={exporting || logs.length === 0}
                    >
                        {exporting ? (
                            <ClipLoader size={14} color="#0E172B" />
                        ) : (
                            <>
                                <Download className="w-4 h-4 mr-2" />
                                Export CSV
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                        Entity Type
                    </Label>
                    <Select
                        value={entityTypeFilter}
                        onValueChange={handleEntityTypeChange}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {entityTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {isAdmin && (
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            Location
                        </Label>
                        <Select
                            value={locationFilter}
                            onValueChange={handleLocationChange}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="All Locations" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    All Locations
                                </SelectItem>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {isAdmin && (
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            From Date
                        </Label>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) =>
                                handleDateFromChange(e.target.value)
                            }
                        />
                    </div>
                )}

                {isAdmin && (
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            To Date
                        </Label>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => handleDateToChange(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* Total + loading */}
            <div className="mb-4 min-h-6">
                <p className="text-sm text-muted-foreground">
                    {total > 0
                        ? `Showing ${pageStart}–${pageEnd} of ${total} entries`
                        : ""}
                </p>
            </div>

            {/* Empty state */}
            {!isFetching && logs.length === 0 && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">
                            No audit logs found
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Try adjusting your filters
                        </p>
                    </CardContent>
                </Card>
            )}

            <div className="relative top-1/2 left-1/2">
                {isFetching && <ClipLoader size={30} />}
            </div>

            {/* Log entries */}
            {logs.length > 0 && !isFetching && (
                <div className="space-y-2">
                    {logs.map((log) => (
                        <Card key={log.id}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <Badge variant="outline">
                                                {log.entityType}
                                            </Badge>
                                            <Badge
                                                variant={actionVariant(
                                                    log.action,
                                                )}
                                            >
                                                {log.action}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                                                {log.entityId}
                                            </span>
                                        </div>

                                        <div className="text-sm space-y-0.5">
                                            <p>
                                                <span className="font-medium">
                                                    Performed by:
                                                </span>{" "}
                                                {log.performedBy
                                                    ? `${log.performedBy.firstName} ${log.performedBy.lastName} (${log.performedBy.role})`
                                                    : "System"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(
                                                    new Date(log.createdAt),
                                                    "MMM d, yyyy 'at' h:mm a",
                                                )}
                                            </p>
                                        </div>

                                        {(log.before || log.after) && (
                                            <details className="mt-3">
                                                <summary className="text-xs cursor-pointer text-blue-600 hover:text-blue-700 select-none">
                                                    View Details
                                                </summary>
                                                <div className="mt-2 space-y-2 text-xs">
                                                    {log.before && (
                                                        <div>
                                                            <p className="font-medium mb-1">
                                                                Before:
                                                            </p>
                                                            <pre className="bg-slate-50 p-2 rounded overflow-auto max-h-48">
                                                                {JSON.stringify(
                                                                    log.before,
                                                                    null,
                                                                    2,
                                                                )}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {log.after && (
                                                        <div>
                                                            <p className="font-medium mb-1">
                                                                After:
                                                            </p>
                                                            <pre className="bg-slate-50 p-2 rounded overflow-auto max-h-48">
                                                                {JSON.stringify(
                                                                    log.after,
                                                                    null,
                                                                    2,
                                                                )}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {total > 25 && (
                <div className="flex items-center justify-between mt-6">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goPrev}
                        disabled={pageIndex === 0 || isFetching}
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                    </Button>

                    <span className="text-sm text-muted-foreground">
                        Page {pageIndex + 1} of {Math.ceil(total / 25)}
                    </span>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goNext}
                        disabled={!nextCursor || isFetching}
                    >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            )}
        </div>
    );
}
