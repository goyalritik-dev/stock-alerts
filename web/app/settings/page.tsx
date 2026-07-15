"use client";

import Link from "next/link";
import { useDashboard } from "@/lib/dashboard-context";
import { Field, NumberInput, Section, TagInput, Toggle } from "@/components/ui";
import { SITES_REGISTRY, type SiteKey } from "@/lib/types";

export default function SettingsPage() {
    const {
        load,
        config,
        setConfig,
        storage,
        saving,
        saveMessage,
        trackerState,
        dirty,
        save,
        fetchConfig,
    } = useDashboard();

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
                        className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
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

                <Section
                    title="Retailer Channels"
                    description="Configure and monitor retail adapters. Changes apply on the worker's next run."
                >
                    <div className="flex flex-col gap-3">
                        {(Object.keys(SITES_REGISTRY) as SiteKey[]).map((key) => {
                            const metadata = SITES_REGISTRY[key];
                            const isEnabled = config.sites[key] ?? false;
                            const siteState = trackerState?.sites?.[key];
                            const failures = siteState?.failures ?? 0;

                            // Determine status indicator classes and glows
                            let statusDotColor = "bg-zinc-600";
                            let statusDotGlow = "";
                            let statusText = "Disabled";

                            if (metadata.comingSoon) {
                                statusDotColor = "bg-zinc-800";
                                statusText = "Coming Soon";
                            } else if (isEnabled) {
                                if (failures === 0) {
                                    statusDotColor = "bg-emerald-400";
                                    statusDotGlow = "shadow-[0_0_8px_#34d399]";
                                    statusText = "Online";
                                } else if (failures >= 5) {
                                    statusDotColor = "bg-rose-500 animate-pulse";
                                    statusDotGlow = "shadow-[0_0_10px_#f43f5e]";
                                    statusText = `${failures}x Failures`;
                                } else {
                                    statusDotColor = "bg-amber-400";
                                    statusDotGlow = "shadow-[0_0_8px_#fbbf24]";
                                    statusText = "Issues";
                                }
                            }

                            return (
                                <div
                                    key={key}
                                    className={`retailer-card rounded-xl border p-4 flex items-center justify-between transition-all duration-200 ${
                                        isEnabled
                                            ? "bg-zinc-900/25 border-zinc-800 hover:border-zinc-700/60"
                                            : "bg-zinc-950/20 border-zinc-900/60 opacity-60"
                                    }`}
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        {/* Brand Favicon Logo from Google CDN */}
                                        <a 
                                            href={metadata.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="relative flex-shrink-0 group"
                                            title={`Visit ${metadata.label}`}
                                        >
                                            <img
                                                src={`https://www.google.com/s2/favicons?sz=64&domain=${metadata.domain}`}
                                                className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 p-1 group-hover:border-zinc-700 transition"
                                                alt=""
                                                onError={(e) => {
                                                    (e.target as HTMLElement).style.display = "none";
                                                }}
                                            />
                                        </a>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <a 
                                                    href={metadata.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-medium text-zinc-200 hover:text-zinc-100 transition truncate hover:underline"
                                                >
                                                    {metadata.label}
                                                </a>
                                                {isEnabled && siteState?.lastError && (
                                                    <span 
                                                        title={siteState.lastError} 
                                                        className="text-rose-400 hover:text-rose-300 cursor-help"
                                                    >
                                                        ⚠️
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full ${statusDotColor} ${statusDotGlow}`}
                                                />
                                                <span className="text-[10px] text-zinc-500 font-medium">
                                                    {statusText}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Toggle switch on the right */}
                                    {!metadata.comingSoon ? (
                                        <Toggle
                                            checked={isEnabled}
                                            onChange={(on) =>
                                                setConfig({
                                                    ...config,
                                                    sites: { ...config.sites, [key]: on },
                                                })
                                            }
                                        />
                                    ) : (
                                        <span className="text-[9px] bg-zinc-900 text-zinc-600 font-semibold px-2 py-0.5 rounded-md border border-zinc-800/80">
                                            Soon
                                        </span>
                                    )}
                                </div>
                            );
                        })}
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
                            hint="Prevents multiple alerts for the same item if stock status flaps."
                        >
                            <NumberInput
                                value={config.schedule.realertCooldownMinutes}
                                min={1}
                                max={1440}
                                onChange={(realertCooldownMinutes) =>
                                    setConfig({
                                        ...config,
                                        schedule: {
                                            ...config.schedule,
                                            realertCooldownMinutes,
                                        },
                                    })
                                }
                            />
                        </Field>
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-200">Quiet hours</p>
                                    <p className="text-xs text-zinc-500">
                                        Mutes push alerts during specified times
                                    </p>
                                </div>
                                <Toggle
                                    checked={config.schedule.quietHours.enabled}
                                    onChange={(enabled) =>
                                        setConfig({
                                            ...config,
                                            schedule: {
                                                ...config.schedule,
                                                quietHours: {
                                                    ...config.schedule.quietHours,
                                                    enabled,
                                                },
                                            },
                                        })
                                    }
                                />
                            </div>
                            {config.schedule.quietHours.enabled && (
                                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
                                    <Field label="Start (HH:MM)">
                                        <input
                                            type="text"
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
                                            placeholder="e.g. 23:00"
                                            className="w-full rounded-xl border border-zinc-850 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-700"
                                        />
                                    </Field>
                                    <Field label="End (HH:MM)">
                                        <input
                                            type="text"
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
                                            placeholder="e.g. 07:00"
                                            className="w-full rounded-xl border border-zinc-850 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-700"
                                        />
                                    </Field>
                                </div>
                            )}
                        </div>
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
                    <div className="flex items-center gap-3">
                        <Link href="/" className="group flex items-center gap-2">
                            <svg className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                            <p className="mt-1 text-sm text-zinc-500">
                                Configure the PS5 India stock tracker
                            </p>
                        </div>
                    </div>
                    {headerRight}
                </header>
                {children}
            </div>
        </div>
    );
}
