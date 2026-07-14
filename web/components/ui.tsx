"use client";

import { useState } from "react";

export function Section({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-lg shadow-black/20">
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    );
}

export function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</label>
            {children}
            {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
        </div>
    );
}

export function TagInput({
    values,
    onChange,
    placeholder,
    validate,
    transform,
}: {
    values: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    validate?: (value: string) => string | null;
    transform?: (value: string) => string;
}) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);

    function commit() {
        const raw = (transform ? transform(draft) : draft).trim();
        if (!raw) return;
        const problem = validate?.(raw) ?? null;
        if (problem) {
            setError(problem);
            return;
        }
        if (!values.includes(raw)) onChange([...values, raw]);
        setDraft("");
        setError(null);
    }

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 focus-within:border-indigo-500">
                {values.map((value) => (
                    <span
                        key={value}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-2.5 py-1 text-sm text-indigo-300"
                    >
                        {value}
                        <button
                            type="button"
                            aria-label={`Remove ${value}`}
                            onClick={() => onChange(values.filter((v) => v !== value))}
                            className="text-indigo-400/70 transition hover:text-red-400 cursor-pointer"
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            commit();
                        } else if (e.key === "Backspace" && !draft && values.length) {
                            onChange(values.slice(0, -1));
                        }
                    }}
                    onBlur={commit}
                    placeholder={values.length ? "" : placeholder}
                    className="min-w-28 flex-1 bg-transparent py-0.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
            </div>
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
    );
}

export function Toggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="group flex items-center gap-3 cursor-pointer"
        >
            <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    checked ? "bg-indigo-500" : "bg-zinc-700"
                }`}
            >
                <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        checked ? "translate-x-0" : "-translate-x-full"
                    }`}
                />
            </span>
            {label && (
                <span className="text-sm text-zinc-300 group-hover:text-zinc-100">{label}</span>
            )}
        </button>
    );
}

export function NumberInput({
    value,
    onChange,
    min,
    max,
    prefix,
}: {
    value: number;
    onChange: (next: number) => void;
    min?: number;
    max?: number;
    prefix?: string;
}) {
    return (
        <div className="flex items-center rounded-xl border border-zinc-700 bg-zinc-950 focus-within:border-indigo-500">
            {prefix && <span className="pl-3 text-sm text-zinc-500">{prefix}</span>}
            <input
                type="number"
                value={Number.isFinite(value) ? value : ""}
                min={min}
                max={max}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none"
            />
        </div>
    );
}
