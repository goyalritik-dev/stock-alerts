import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

let activeProcess: any = null;

function githubEnv() {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (token && repo) return { token, repo };
    return null;
}

export async function POST() {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gh = githubEnv();
    if (gh) {
        try {
            console.log(`Dispatching GitHub Action stock-check.yml run for repo: ${gh.repo}`);
            const url = `https://api.github.com/repos/${gh.repo}/actions/workflows/stock-check.yml/dispatches`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${gh.token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                    "User-Agent": "ps5-stock-alert-dashboard",
                },
                body: JSON.stringify({ ref: "main" }),
            });
            if (!res.ok) {
                const body = await res.text();
                return NextResponse.json(
                    { error: `GitHub trigger failed: ${res.status} ${body}` },
                    { status: 500 }
                );
            }
            return NextResponse.json({ ok: true, status: "dispatched" });
        } catch (error: any) {
            return NextResponse.json(
                { error: error.message ?? "GitHub trigger failed" },
                { status: 500 }
            );
        }
    }

    if (activeProcess) {
        return NextResponse.json({ ok: true, status: "running" });
    }

    // Local development fallback
    const workerCwd = path.resolve(process.cwd(), ["..", "worker"].join("/"));

    const runPromise = new Promise<void>((resolve, reject) => {
        console.log("Triggering worker check run from local spawn...");
        activeProcess = spawn("npm", ["run", "check"], {
            cwd: workerCwd,
            stdio: "inherit",
        });

        activeProcess.on("close", (code: number | null) => {
            activeProcess = null;
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });

        activeProcess.on("error", (err: any) => {
            activeProcess = null;
            reject(err);
        });
    });

    try {
        await runPromise;
        return NextResponse.json({ ok: true, status: "success" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message ?? "Local run failed" }, { status: 500 });
    }
}

export async function GET() {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gh = githubEnv();
    if (gh) {
        try {
            // Check for in-progress runs
            const urlProgress = `https://api.github.com/repos/${gh.repo}/actions/workflows/stock-check.yml/runs?status=in_progress`;
            const res1 = await fetch(urlProgress, {
                headers: {
                    Authorization: `Bearer ${gh.token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "ps5-stock-alert-dashboard",
                },
                cache: "no-store",
            });
            let running = false;
            if (res1.ok) {
                const data = (await res1.json()) as { total_count: number };
                running = data.total_count > 0;
            }

            // Also check for queued runs
            if (!running) {
                const urlQueued = `https://api.github.com/repos/${gh.repo}/actions/workflows/stock-check.yml/runs?status=queued`;
                const res2 = await fetch(urlQueued, {
                    headers: {
                        Authorization: `Bearer ${gh.token}`,
                        Accept: "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                        "User-Agent": "ps5-stock-alert-dashboard",
                    },
                    cache: "no-store",
                });
                if (res2.ok) {
                    const data = (await res2.json()) as { total_count: number };
                    running = data.total_count > 0;
                }
            }

            return NextResponse.json({ running });
        } catch {
            return NextResponse.json({ running: false });
        }
    }

    return NextResponse.json({ running: !!activeProcess });
}
