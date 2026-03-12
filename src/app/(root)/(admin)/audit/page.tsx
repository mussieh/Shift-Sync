import {
    getAuditLogs,
    getAuditLogEntityTypes,
    getLocationsForAudit,
} from "@/lib/actions/audit";
import AuditClient from "@/components/audit/AuditClient";
import { auth } from "@/auth";

export default async function AuditPage() {
    const session = await auth();
    const [initialPage, entityTypes, locations] = await Promise.all([
        getAuditLogs(),
        getAuditLogEntityTypes(),
        getLocationsForAudit(),
    ]);

    return (
        <AuditClient
            initialPage={initialPage}
            entityTypes={entityTypes}
            locations={locations}
            isAdmin={session?.user.role === "ADMIN"}
        />
    );
}
