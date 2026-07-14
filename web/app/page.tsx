"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Field, NumberInput, Section, TagInput, Toggle } from "@/components/ui";
import { SITE_LABELS, type SiteKey, type TrackerConfig, type TrackerState } from "@/lib/types";

type LoadState =
    | { status: "loading" }
    | { status: "locked" }
    | { status: "error"; message: string }
    | { status: "ready" };

export default function Dashboard() {
    const [load, setLoad] = useState<LoadState>({ status: "loading" });
    const [config, setConfig] = useState<TrackerConfig | null>(null);
    const [savedSnapshot, setSavedSnapshot] = useState<string>("");
    const [storage, setStorage] = useState<"github" | "local">("local");
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [trackerState, setTrackerState] = useState<TrackerState | null>(null);

    const fetchConfig = useCallback(async () => {
        setLoad({ status: "loading" });
        const res = await fetch("/api/config");
        if (res.status === 401) {
            setLoad({ status: "locked" });
            return;
        }
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setLoad({
                status: "error",
                message: body?.error ?? `Failed to load config (${res.status})`,
            });
            return;
        }
        const body = (await res.json()) as {
            config: TrackerConfig;
            storage: "github" | "local";
        };
        setConfig(body.config);
        setSavedSnapshot(JSON.stringify(body.config));
        setStorage(body.storage);
        setLoad({ status: "ready" });

        // Stock snapshot is non-critical; load it after the config
        void fetch("/api/state")
            .then((r) => (r.ok ? r.json() : null))
            .then((b) => setTrackerState(b?.state ?? null))
            .catch(() => setTrackerState(null));
    }, []);

    useEffect(() => {
        void fetchConfig();
    }, [fetchConfig]);

    const dirty = useMemo(
        () => config !== null && JSON.stringify(config) !== savedSnapshot,
        [config, savedSnapshot]
    );

    async function save() {
        if (!config) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            const res = await fetch("/api/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                setSaveMessage(body?.error ?? "Save failed");
                return;
            }
            setSavedSnapshot(JSON.stringify(config));
            setSaveMessage(
                storage === "github"
                    ? "Saved — worker picks it up on the next run"
                    : "Saved to config.json"
            );
        } finally {
            setSaving(false);
        }
    }

    if (load.status === "loading") {
        return (
            <Shell>
                <p className="mt-24 text-center text-sm text-zinc-500">Loading…</p>
            </Shell>
        );
    }

    if (load.status === "locked") {
        return (
            <Shell>
                <PasswordGate onUnlocked={fetchConfig} />
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
                <div className="flex items-center gap-3">
                    <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                            storage === "github"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-amber-500/15 text-amber-300"
                        }`}
                    >
                        {storage === "github" ? "Synced with GitHub" : "Local config.json"}
                    </span>
                    <button
                        onClick={() => void save()}
                        disabled={!dirty || saving}
                        className="rounded-xl bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
                    >
                        {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                    </button>
                </div>
            }
        >
            {saveMessage && (
                <p className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300">
                    {saveMessage}
                </p>
            )}

            {trackerState && <Snapshot state={trackerState} />}

            <div className="grid gap-6 lg:grid-cols-2">
                <Section
                    title="Search & Match"
                    description="What the worker searches for on every site, and how it filters results."
                >
                    <Field
                        label="Search queries"
                        hint="Each query is run against every enabled site's search page."
                    >
                        <TagInput
                            values={config.search.queries}
                            onChange={(queries) =>
                                setConfig({
                                    ...config,
                                    search: { ...config.search, queries },
                                })
                            }
                            placeholder="e.g. ps5 console"
                            transform={(v) => v.toLowerCase()}
                        />
                    </Field>
                    <Field
                        label="Title must contain"
                        hint='Every group must match. Use | for alternatives, e.g. "playstation 5|ps5".'
                    >
                        <TagInput
                            values={config.search.includeKeywords}
                            onChange={(includeKeywords) =>
                                setConfig({
                                    ...config,
                                    search: { ...config.search, includeKeywords },
                                })
                            }
                            placeholder="e.g. playstation 5|ps5"
                            transform={(v) => v.toLowerCase()}
                        />
                    </Field>
                    <Field label="Title must NOT contain" hint="Filters out accessories and games.">
                        <TagInput
                            values={config.search.excludeKeywords}
                            onChange={(excludeKeywords) =>
                                setConfig({
                                    ...config,
                                    search: { ...config.search, excludeKeywords },
                                })
                            }
                            placeholder="e.g. controller"
                            transform={(v) => v.toLowerCase()}
                        />
                    </Field>
                    <Field
                        label="Results checked per site"
                        hint="Top N search results examined on each site."
                    >
                        <NumberInput
                            value={config.search.maxResultsPerSite}
                            min={1}
                            max={20}
                            onChange={(maxResultsPerSite) =>
                                setConfig({
                                    ...config,
                                    search: { ...config.search, maxResultsPerSite },
                                })
                            }
                        />
                    </Field>
                </Section>

                <div className="space-y-6">
                    <Section
                        title="Price band"
                        description="Listings outside this range are ignored (filters accessories and scalpers)."
                    >
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Min price">
                                <NumberInput
                                    prefix="₹"
                                    value={config.price.min}
                                    min={0}
                                    onChange={(min) =>
                                        setConfig({ ...config, price: { ...config.price, min } })
                                    }
                                />
                            </Field>
                            <Field label="Max price">
                                <NumberInput
                                    prefix="₹"
                                    value={config.price.max}
                                    min={0}
                                    onChange={(max) =>
                                        setConfig({ ...config, price: { ...config.price, max } })
                                    }
                                />
                            </Field>
                        </div>
                    </Section>

                    <Section
                        title="Delivery pincodes"
                        description="You get alerted only if the product ships to at least one of these."
                    >
                        <TagInput
                            values={config.pincodes}
                            onChange={(pincodes) => setConfig({ ...config, pincodes })}
                            placeholder="e.g. 110001"
                            validate={(v) =>
                                /^\d{6}$/.test(v) ? null : "Pincode must be exactly 6 digits"
                            }
                        />
                    </Section>
                </div>

                <Section title="Sites" description="Toggle which retailers are checked every run.">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(Object.keys(SITE_LABELS) as SiteKey[]).map((key) => (
                            <div
                                key={key}
                                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                            >
                                <span className="text-sm text-zinc-200">{SITE_LABELS[key]}</span>
                                <Toggle
                                    checked={config.sites[key] ?? false}
                                    onChange={(on) =>
                                        setConfig({
                                            ...config,
                                            sites: { ...config.sites, [key]: on },
                                        })
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </Section>

                <div className="space-y-6">
                    <Section
                        title="Schedule"
                        description="How often the worker runs. GitHub Actions supports a minimum of 5 minutes."
                    >
                        <Field label="Check interval (minutes)">
                            <NumberInput
                                value={config.schedule.intervalMinutes}
                                min={5}
                                max={60}
                                onChange={(intervalMinutes) =>
                                    setConfig({
                                        ...config,
                                        schedule: { ...config.schedule, intervalMinutes },
                                    })
                                }
                            />
                        </Field>
                        <Field
                            label="Re-alert cooldown (minutes)"
                            hint="Minimum gap before the same product can alert again (stops flapping stock from spamming you)."
                        >
                            <NumberInput
                                value={config.schedule.realertCooldownMinutes ?? 60}
                                min={0}
                                max={1440}
                                onChange={(realertCooldownMinutes) =>
                                    setConfig({
                                        ...config,
                                        schedule: { ...config.schedule, realertCooldownMinutes },
                                    })
                                }
                            />
                        </Field>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-300">Quiet hours</span>
                            <Toggle
                                checked={config.schedule.quietHours.enabled}
                                onChange={(enabled) =>
                                    setConfig({
                                        ...config,
                                        schedule: {
                                            ...config.schedule,
                                            quietHours: { ...config.schedule.quietHours, enabled },
                                        },
                                    })
                                }
                            />
                        </div>
                        {config.schedule.quietHours.enabled && (
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="From">
                                    <input
                                        type="time"
                                        value={config.schedule.quietHours.start}
                                        onChange={(e) =>
                                            setConfig({
                                                ...config,
                                                schedule: {
                                                    ...config.schedule,
                                                    quietHours: {
                                                        ...config.schedule.quietHours,
                                                        start: e.target.value,
                                                    },
                                                },
                                            })
                                        }
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                                    />
                                </Field>
                                <Field label="To">
                                    <input
                                        type="time"
                                        value={config.schedule.quietHours.end}
                                        onChange={(e) =>
                                            setConfig({
                                                ...config,
                                                schedule: {
                                                    ...config.schedule,
                                                    quietHours: {
                                                        ...config.schedule.quietHours,
                                                        end: e.target.value,
                                                    },
                                                },
                                            })
                                        }
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                                    />
                                </Field>
                            </div>
                        )}
                    </Section>

                    <Section
                        title="Notifications"
                        description="Bot tokens and API keys live in environment secrets, never in this config."
                    >
                        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                            <div>
                                <p className="text-sm text-zinc-200">Telegram</p>
                                <p className="text-xs text-zinc-500">
                                    Instant push via your Telegram bot
                                </p>
                            </div>
                            <Toggle
                                checked={config.notifications.telegram.enabled}
                                onChange={(enabled) =>
                                    setConfig({
                                        ...config,
                                        notifications: {
                                            ...config.notifications,
                                            telegram: { enabled },
                                        },
                                    })
                                }
                            />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                            <div>
                                <p className="text-sm text-zinc-200">WhatsApp</p>
                                <p className="text-xs text-zinc-500">Via CallMeBot personal API</p>
                            </div>
                            <Toggle
                                checked={config.notifications.whatsapp.enabled}
                                onChange={(enabled) =>
                                    setConfig({
                                        ...config,
                                        notifications: {
                                            ...config.notifications,
                                            whatsapp: { enabled },
                                        },
                                    })
                                }
                            />
                        </div>
                    </Section>
                </div>
            </div>
        </Shell>
    );
}

function Snapshot({ state }: { state: TrackerState }) {
    const [expanded, setExpanded] = useState(false);
    const products = Object.entries(state.products ?? {}).sort(
        ([, a], [, b]) => Number(b.inStock) - Number(a.inStock)
    );
    const inStockCount = products.filter(([, p]) => p.inStock).length;
    const unhealthySites = Object.entries(state.sites ?? {}).filter(([, s]) => s.failures >= 3);
    const COLLAPSED_LIMIT = 8;
    const visible = expanded ? products : products.slice(0, COLLAPSED_LIMIT);

    return (
        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
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
                {visible.map(([key, p]) => (
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
                            <span className="text-xs text-zinc-500">
                                {key.split(":")[0]}
                                {p.price ? ` · ₹${p.price.toLocaleString("en-IN")}` : ""}
                            </span>
                        </div>
                        <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                p.inStock
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-zinc-800 text-zinc-500"
                            }`}
                        >
                            {p.inStock ? "In stock" : "Out of stock"}
                        </span>
                    </li>
                ))}
                {products.length === 0 && (
                    <li className="text-sm text-zinc-500">
                        No products tracked yet — the worker hasn&apos;t run.
                    </li>
                )}
            </ul>
            {products.length > COLLAPSED_LIMIT && (
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
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-5xl px-6 py-10">
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

function PasswordGate({ onUnlocked }: { onUnlocked: () => void }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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
            onUnlocked();
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            onSubmit={submit}
            className="mx-auto mt-24 max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center"
        >
            <h2 className="text-lg font-semibold">Dashboard locked</h2>
            <p className="mt-1 text-sm text-zinc-500">Enter the access password to continue</p>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="mt-6 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <button
                type="submit"
                disabled={busy || !password}
                className="mt-4 w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:bg-zinc-700 disabled:text-zinc-400"
            >
                {busy ? "Checking…" : "Unlock"}
            </button>
        </form>
    );
}
