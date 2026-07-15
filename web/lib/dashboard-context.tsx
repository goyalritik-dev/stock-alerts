"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { type TrackerConfig, type TrackerState } from "./types";

export type LoadState =
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready" };

interface DashboardContextType {
    load: LoadState;
    config: TrackerConfig | null;
    setConfig: React.Dispatch<React.SetStateAction<TrackerConfig | null>>;
    storage: "github" | "local";
    saving: boolean;
    saveMessage: string | null;
    trackerState: TrackerState | null;
    dirty: boolean;
    save: () => Promise<void>;
    fetchConfig: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
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

    return (
        <DashboardContext.Provider
            value={{
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
            }}
        >
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard() {
    const context = useContext(DashboardContext);
    if (context === undefined) {
        throw new Error("useDashboard must be used within a DashboardProvider");
    }
    return context;
}
