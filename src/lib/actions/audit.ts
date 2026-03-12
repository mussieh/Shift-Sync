"use server";

import { prisma } from "@/lib/db/prisma";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export interface AuditLogFrontend {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    before: unknown;
    after: unknown;
    performedById: string;
    performedBy: {
        firstName: string;
        lastName: string;
        role: string;
    } | null;
    createdAt: string;
}

export interface AuditLogsPage {
    logs: AuditLogFrontend[];
    nextCursor: string | null;
    total: number;
}

export interface AuditLogFilters {
    entityType?: string;
    dateFrom?: string; // ISO date string "YYYY-MM-DD"
    dateTo?: string; // ISO date string "YYYY-MM-DD"
    locationId?: string;
    shiftId?: string; // manager scoped view
}

const PAGE_SIZE = 25;

/* -------------------------------------------------------------------------- */
/*                     INTERNAL: BUILD WHERE CLAUSE                          */
/* -------------------------------------------------------------------------- */

async function buildWhere(filters?: AuditLogFilters) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (filters?.entityType) {
        where.entityType = filters.entityType;
    }

    // Shift-scoped view for managers — only show logs for that shift
    if (filters?.shiftId) {
        where.entityId = filters.shiftId;
        where.entityType = { in: ["Shift", "ShiftAssignment"] };
    }

    // Date range
    // Both bounds use explicit UTC midnight via "T00:00:00.000Z" so that
    // `new Date("YYYY-MM-DD")` is never parsed as local-midnight (which would
    // shift the boundary by the server's UTC offset).
    // The upper bound uses exclusive `lt` on the START of the day AFTER dateTo
    // rather than `lte` on end-of-day, which is unambiguous regardless of
    // millisecond precision or Postgres timezone configuration.
    if (filters?.dateFrom || filters?.dateTo) {
        const gte = filters.dateFrom
            ? new Date(filters.dateFrom + "T00:00:00.000Z")
            : undefined;

        let lt: Date | undefined;
        if (filters.dateTo) {
            lt = new Date(filters.dateTo + "T00:00:00.000Z");
            lt.setUTCDate(lt.getUTCDate() + 1); // start of the next day, exclusive
        }

        where.createdAt = {
            ...(gte ? { gte } : {}),
            ...(lt ? { lt } : {}),
        };
    }

    // Location filter — scope to shifts at that location
    if (filters?.locationId) {
        const shiftIds = await prisma.shift
            .findMany({
                where: { locationId: filters.locationId },
                select: { id: true },
            })
            .then((s) => s.map((x) => x.id));

        where.entityId = { in: shiftIds };
        if (!filters.entityType) {
            where.entityType = { in: ["Shift", "ShiftAssignment"] };
        }
    }

    return where;
}

function toFrontend(log: {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    before: unknown;
    after: unknown;
    performedById: string;
    performedBy: { firstName: string; lastName: string; role: string } | null;
    createdAt: Date;
}): AuditLogFrontend {
    return {
        id: log.id,
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        before: log.before,
        after: log.after,
        performedById: log.performedById,
        performedBy: log.performedBy ?? null,
        createdAt: log.createdAt.toISOString(),
    };
}

/* -------------------------------------------------------------------------- */
/*                        FETCH AUDIT LOGS (paginated)                       */
/*                                                                            */
/* cursor = createdAt ISO string of the last item in the previous page.      */
/* Keyset pagination — stable even if new rows are inserted between pages.   */
/* -------------------------------------------------------------------------- */

export async function getAuditLogs(
    filters?: AuditLogFilters,
    cursor?: string,
): Promise<AuditLogsPage> {
    try {
        const where = await buildWhere(filters);

        if (cursor) {
            where.createdAt = {
                ...where.createdAt,
                lt: new Date(cursor),
            };
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: PAGE_SIZE + 1,
                include: {
                    performedBy: {
                        select: { firstName: true, lastName: true, role: true },
                    },
                },
            }),
            // Total count ignores the cursor so it always reflects the full filtered set
            prisma.auditLog.count({ where: await buildWhere(filters) }),
        ]);

        const hasMore = logs.length > PAGE_SIZE;
        const items = hasMore ? logs.slice(0, PAGE_SIZE) : logs;
        const nextCursor = hasMore
            ? items[items.length - 1].createdAt.toISOString()
            : null;

        return { logs: items.map(toFrontend), nextCursor, total };
    } catch (err) {
        console.error("getAuditLogs error:", err);
        return { logs: [], nextCursor: null, total: 0 };
    }
}

/* -------------------------------------------------------------------------- */
/*                       SHIFT AUDIT HISTORY (manager view)                  */
/*                                                                            */
/* All Shift + ShiftAssignment entries for one shift. No pagination needed   */
/* here — a single shift's history is bounded and small.                     */
/* -------------------------------------------------------------------------- */

export async function getShiftAuditHistory(
    shiftId: string,
): Promise<AuditLogFrontend[]> {
    try {
        const logs = await prisma.auditLog.findMany({
            where: {
                entityId: shiftId,
                entityType: { in: ["Shift", "ShiftAssignment"] },
            },
            orderBy: { createdAt: "desc" },
            include: {
                performedBy: {
                    select: { firstName: true, lastName: true, role: true },
                },
            },
        });
        return logs.map(toFrontend);
    } catch (err) {
        console.error("getShiftAuditHistory error:", err);
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/*                         DISTINCT ENTITY TYPES                             */
/* -------------------------------------------------------------------------- */

export async function getAuditLogEntityTypes(): Promise<string[]> {
    try {
        const results = await prisma.auditLog.findMany({
            select: { entityType: true },
            distinct: ["entityType"],
            orderBy: { entityType: "asc" },
        });
        return results.map((r) => r.entityType);
    } catch (err) {
        console.error("getAuditLogEntityTypes error:", err);
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/*                        LOCATIONS FOR FILTER DROPDOWN                      */
/* -------------------------------------------------------------------------- */

export async function getLocationsForAudit(): Promise<
    { id: string; name: string }[]
> {
    try {
        return await prisma.location.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        });
    } catch (err) {
        console.error("getLocationsForAudit error:", err);
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/*                          EXPORT AS CSV (admin only)                       */
/*                                                                            */
/* No pagination — fetches all matching rows for the export.                 */
/* Returns a CSV string; the client triggers a browser download.             */
/* -------------------------------------------------------------------------- */

export async function exportAuditLogsCsv(
    filters?: AuditLogFilters,
): Promise<{ success: boolean; csv?: string; error?: string }> {
    try {
        const where = await buildWhere(filters);

        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                performedBy: {
                    select: { firstName: true, lastName: true, role: true },
                },
            },
        });

        const esc = (val: unknown): string => {
            const s = val == null ? "" : String(val);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const header = [
            "ID",
            "Entity Type",
            "Entity ID",
            "Action",
            "Performed By",
            "Role",
            "Created At",
        ].join(",");

        const rows = logs.map((log) =>
            [
                esc(log.id),
                esc(log.entityType),
                esc(log.entityId),
                esc(log.action),
                esc(
                    log.performedBy
                        ? `${log.performedBy.firstName} ${log.performedBy.lastName}`
                        : "System",
                ),
                esc(log.performedBy?.role ?? ""),
                esc(log.createdAt.toISOString()),
            ].join(","),
        );

        return { success: true, csv: [header, ...rows].join("\n") };
    } catch (err) {
        console.error("exportAuditLogsCsv error:", err);
        return { success: false, error: (err as Error).message };
    }
}
