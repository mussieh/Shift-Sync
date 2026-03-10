import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that require login (all roles)
export const protectedRoutes = [
    "/dashboard",
    "/schedule",
    "/staff",
    "/on-duty",
    "/swaps",
    "/locations",
    "/reports",
    "/notifications",
    "/profile",
    "/audit-logs",
];

// Routes only accessible by ADMIN or MANAGER
export const adminManagerOnlyRoutes = [
    "/dashboard",
    "/locations",
    "/audit-logs",
    "/on-duty",
    "/reports",
    "/staff",
];

const cookieName =
    process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token";

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Public routes
    if (pathname.startsWith("/login") || pathname.startsWith("/unauthorized")) {
        return NextResponse.next();
    }

    // Check session
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        cookieName,
        secureCookie: process.env.NODE_ENV === "production",
    });

    const isLoggedIn = !!token;

    // Not logged in
    if (!isLoggedIn) {
        if (protectedRoutes.some((path) => pathname.startsWith(path))) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    } else {
        // Logged in, check admin/manager only routes
        if (
            adminManagerOnlyRoutes.some((path) => pathname.startsWith(path)) &&
            token?.role !== "ADMIN" &&
            token?.role !== "MANAGER"
        ) {
            return NextResponse.redirect(new URL("/unauthorized", request.url));
        }
    }

    return NextResponse.next();
}

// Apply middleware to all routes except api/_next/public files and public routes
export const matcher = [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|login|unauthorized).*)",
];
