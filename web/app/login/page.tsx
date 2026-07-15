"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!res.ok) {
                setError("Wrong password");
                return;
            }
            // Redirect to original path or home
            const nextPath = searchParams.get("from") ?? "/";
            router.push(nextPath);
            router.refresh();
        } catch {
            setError("Authentication failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            onSubmit={submit}
            className="glass-panel w-full max-w-sm rounded-2xl p-8 text-center relative z-10"
        >
            <h1 className="text-2xl font-bold tracking-tight mb-1 bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                PS5 Stock Alert
            </h1>
            <h2 className="text-base font-semibold text-zinc-200 mt-4">Dashboard locked</h2>
            <p className="mt-1 text-xs text-zinc-500">Enter the access password to continue</p>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="mt-6 w-full rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-700 transition"
                data-testid="password-input"
            />
            {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
            <button
                type="submit"
                disabled={busy || !password}
                className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
            >
                {busy ? "Checking…" : "Unlock"}
            </button>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden flex items-center justify-center p-6">
            {/* Ambient Background Glow Layer */}
            <div className="ambient-bg">
                <div className="ambient-glow-1" />
                <div className="ambient-glow-2" />
            </div>

            <Suspense fallback={<p className="text-sm text-zinc-500">Loading auth gate…</p>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
