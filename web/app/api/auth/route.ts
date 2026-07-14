import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
    const { password } = (await request.json()) as { password?: string };

    if (!verifyPassword(password ?? "")) {
        return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    const token = expectedToken();
    if (token) {
        response.cookies.set(AUTH_COOKIE, token, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
        });
    }
    return response;
}
