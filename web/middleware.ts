import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "psa_auth";

// Hash function that is compatible with Next.js edge runtime (Web Crypto API)
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
    const password = process.env.ACCESS_PASSWORD;
    if (!password) {
        // No password configured -> open access
        return NextResponse.next();
    }

    const { pathname } = request.nextUrl;

    // Login page, Next assets, and auth API are always allowed
    if (
        pathname.startsWith("/api/auth") ||
        pathname === "/login" ||
        pathname.startsWith("/_next") ||
        pathname.includes(".")
    ) {
        return NextResponse.next();
    }

    const expected = await hashPassword(password);
    const token = request.cookies.get(AUTH_COOKIE)?.value;

    if (token !== expected) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (authentication API)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
    ],
};
