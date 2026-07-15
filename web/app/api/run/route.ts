import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

let activeProcess: any = null;

export async function POST() {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (activeProcess) {
        return NextResponse.json({ ok: true, status: "running" });
    }

    // Construct the working directory dynamically to bypass Turbopack static tracing
    const workerCwd = path.resolve(process.cwd(), ["..", "worker"].join("/"));

    const runPromise = new Promise<void>((resolve, reject) => {
        console.log("Triggering worker check run from dashboard API...");
        activeProcess = spawn("npm", ["run", "check"], {
            cwd: workerCwd,
            stdio: "inherit",
        });

        activeProcess.on("close", (code: number | null) => {
            activeProcess = null;
            if (code === 0) {
                console.log("Worker check run completed successfully.");
                resolve();
            } else {
                console.error(`Worker check run failed with exit code ${code}`);
                reject(new Error(`Worker exited with code ${code}`));
            }
        });

        activeProcess.on("error", (err: any) => {
            activeProcess = null;
            console.error("Failed to start worker process:", err);
            reject(err);
        });
    });

    try {
        await runPromise;
        return NextResponse.json({ ok: true, status: "success" });
    } catch (err: any) {
        return NextResponse.json({ error: err.message ?? "Run failed" }, { status: 500 });
    }
}

export async function GET() {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ running: !!activeProcess });
}
