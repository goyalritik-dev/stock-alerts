"use client";

import { useState } from "react";
import Link from "next/link";
import { Toggle } from "@/components/ui";
import { useDashboard } from "@/lib/dashboard-context";
import { SITE_LABELS, type SiteKey, type TrackerConfig, type TrackerState } from "@/lib/types";

export default function Dashboard() {
    const { load, config, trackerState, fetchConfig } = useDashboard();

    if (load.status === "loading") {
        return (
            <Shell>
                <p className="mt-24 text-center text-sm text-zinc-500">Loading…</p>
            </Shell>
        );
    }

    if (load.status === "error" || !config) {
        return (
            <Shell>
                <div className="mt-24 text-center">
                    <p className="text-sm text-red-400">
                        {load.status === "error" ? load.message : "No config loaded"}
                    </p>
                    <button
                        onClick={() => void fetchConfig()}
                        className="mt-4 rounded-xl bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                    >
                        Retry
                    </button>
                </div>
            </Shell>
        );
    }

    return (
        <Shell
            headerRight={
                <Link
                    href="/settings"
                    className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/60 transition shadow-sm"
                    title="Settings"
                >
                    <svg className="w-5 h-5 animate-[spin_8s_linear_infinite] hover:animate-[spin_2s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </Link>
            }
        >
            {trackerState && <Snapshot state={trackerState} config={config} />}
        </Shell>
    );
}

function Snapshot({ state, config }: { state: TrackerState; config: TrackerConfig | null }) {
    const [expanded, setExpanded] = useState(false);
    const [filters, setFilters] = useState(state.filters ?? { snapshot_view: "_in_stock" });

    const products = Object.entries(state.products ?? {}).sort(
        ([, a], [, b]) => Number(b.inStock) - Number(a.inStock)
    );
    const inStockProducts = products.filter(([, p]) => p.inStock);
    const inStockCount = inStockProducts.length;

    // Separate sites into successful and failed ones based on failures status
    const successfulSites: SiteKey[] = [];
    const failedSites: {
        key: SiteKey;
        failures: number;
        lastError: string | null;
        isPersistent: boolean;
    }[] = [];

    (Object.keys(SITE_LABELS) as SiteKey[]).forEach((key) => {
        const isEnabled = config?.sites[key] ?? false;
        const siteState = state.sites?.[key];
        const failures = siteState?.failures ?? 0;
        const lastError = siteState?.lastError ?? null;

        if (failures >= 5) {
            // Keep showing on top of the snapshot until they run successfully (failures goes to 0)
            failedSites.push({
                key,
                failures,
                lastError,
                isPersistent: true,
            });
        } else if (isEnabled) {
            if (failures === 0) {
                successfulSites.push(key);
            } else {
                failedSites.push({
                    key,
                    failures,
                    lastError,
                    isPersistent: false,
                });
            }
        }
    });

    const unhealthySites = Object.entries(state.sites ?? {}).filter(([, s]) => s.failures >= 3);
    const COLLAPSED_LIMIT = 8;
    const displayProducts = filters.snapshot_view === "all" ? products : inStockProducts;
    const visible = expanded ? displayProducts : displayProducts.slice(0, COLLAPSED_LIMIT);

    return (
        <section className="glass-panel mb-6 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-zinc-100">
                    Stock snapshot
                    <span
                        className={`ml-3 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            inStockCount > 0
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-zinc-800 text-zinc-400"
                        }`}
                    >
                        {inStockCount} in stock
                    </span>
                </h2>
                {state.lastRunAt && (
                    <span className="text-xs text-zinc-500">
                        last run {new Date(state.lastRunAt).toLocaleString("en-IN")}
                    </span>
                )}
            </div>

            {/* Captured Status Pills on top of snapshot */}
            <div className="mt-4 p-4 rounded-xl border border-zinc-850 bg-zinc-950/40">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Last Run Status:
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {successfulSites.map((key) => (
                            <span
                                key={key}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20 shadow-sm transition hover:bg-emerald-500/15"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {SITE_LABELS[key]}
                            </span>
                        ))}
                        {failedSites.map(({ key, failures, lastError, isPersistent }) => (
                            <span
                                key={key}
                                title={lastError ?? "Unknown error"}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border shadow-sm transition ${
                                    isPersistent
                                        ? "bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/20"
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/15"
                                }`}
                            >
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                        isPersistent ? "bg-rose-400 animate-ping" : "bg-amber-400"
                                    }`}
                                />
                                {SITE_LABELS[key]}
                                <span className="text-[10px] opacity-75 ml-1">
                                    ({failures}x failed{isPersistent ? " - persistent" : ""})
                                </span>
                            </span>
                        ))}
                        {successfulSites.length === 0 && failedSites.length === 0 && (
                            <span className="text-xs text-zinc-500 italic">
                                No sites active in config
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end mt-3 gap-3">
                <span
                    className={`block truncate text-sm text-zinc-200 ${
                        filters.snapshot_view === "all" ? "text-zinc-200" : "text-zinc-700"
                    }`}
                >
                    All Products
                </span>

                <Toggle
                    checked={filters.snapshot_view === "in_stock"}
                    onChange={(on) =>
                        setFilters((p) => ({ ...p, snapshot_view: on ? "in_stock" : "all" }))
                    }
                />

                <span
                    className={`block truncate text-sm text-zinc-200 ${
                        filters.snapshot_view === "in_stock" ? "text-zinc-200" : "text-zinc-700"
                    }`}
                >
                    In Stock
                </span>
            </div>

            {unhealthySites.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
                    {unhealthySites.map(([key, s]) => (
                        <p key={key}>
                            {key}: {s.failures} consecutive failures
                            {s.lastError ? ` — ${s.lastError}` : ""}
                        </p>
                    ))}
                </div>
            )}

            <ul className="mt-4 space-y-2">
                {visible.map(([key, p]) => {
                    const [siteKey] = key.split(":");
                    return (
                        <li
                            key={key}
                            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5"
                        >
                            <div className="min-w-0">
                                <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate text-sm text-zinc-200 hover:text-indigo-300"
                                >
                                    {p.title}
                                </a>
                                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                                    <span>{SITE_LABELS[siteKey as SiteKey] ?? siteKey}</span>
                                    <span>•</span>
                                    <span>
                                        checked {new Date(p.lastChecked).toLocaleTimeString("en-IN")}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-3">
                                {p.price !== null && (
                                    <span className="text-sm font-semibold text-zinc-100">
                                        ₹{p.price.toLocaleString("en-IN")}
                                    </span>
                                )}
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        p.inStock
                                            ? "bg-emerald-500/15 text-emerald-400"
                                            : "bg-zinc-800 text-zinc-500"
                                    }`}
                                >
                                    {p.inStock ? "In stock" : "Out of stock"}
                                </span>
                            </div>
                        </li>
                    );
                })}
                {products.length === 0 && (
                    <li className="text-md text-zinc-200 text-center">
                        No products tracked yet — the worker hasn&apos;t run.
                    </li>
                )}
                {visible.length === 0 && (
                    <li className="text-md text-zinc-200 text-center">
                        No products found anywhere
                    </li>
                )}
            </ul>
            {displayProducts.length > COLLAPSED_LIMIT && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 text-xs text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
                >
                    {expanded
                        ? "Show less"
                        : `Show ${products.length - COLLAPSED_LIMIT} more product${
                              products.length - COLLAPSED_LIMIT === 1 ? "" : "s"
                          }`}
                </button>
            )}
        </section>
    );
}

function Shell({
    children,
    headerRight,
}: {
    children: React.ReactNode;
    headerRight?: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
            {/* Ambient Background Glow Layer */}
            <div className="ambient-bg">
                <div className="ambient-glow-1" />
                <div className="ambient-glow-2" />
            </div>

            <div className="mx-auto max-w-5xl px-6 py-10 relative z-10">
                <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">PS5 Stock Alert</h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            Tracker configuration — changes apply on the worker&apos;s next run
                        </p>
                    </div>
                    {headerRight}
                </header>
                {children}
            </div>
        </div>
    );
}
