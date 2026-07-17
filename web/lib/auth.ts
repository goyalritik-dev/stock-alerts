import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "psa_auth";

function hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

export function expectedToken(): string | null {
    const password = process.env.ACCESS_PASSWORD;
    if (!password) return null; // no password configured -> open access (local dev)
    return hash(password);
}

export function verifyPassword(password: string): boolean {
    const expected = expectedToken();
    if (!expected) return true;

    const given = Buffer.from(hash(password));
    const want = Buffer.from(expected);
    return given.length === want.length && timingSafeEqual(given, want);
}

export async function isAuthenticated(): Promise<boolean> {
    const expected = expectedToken();
    if (!expected) return true;
    const store = await cookies();
    return store.get(AUTH_COOKIE)?.value === expected;
}
