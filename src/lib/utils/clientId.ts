// utils/clientId.ts
const clientId =
    typeof window !== "undefined"
        ? (sessionStorage.getItem("client-id") ?? crypto.randomUUID())
        : "";

if (typeof window !== "undefined" && !sessionStorage.getItem("client-id")) {
    sessionStorage.setItem("client-id", clientId);
}

export const getClientId = () => clientId;
