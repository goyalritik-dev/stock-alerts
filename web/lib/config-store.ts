import { promises as fs } from "fs";
import path from "path";
import type { TrackerConfig } from "./types";

/**
 * Config storage abstraction.
 *
 * - Local development: reads/writes ../config.json at the repo root.
 * - Deployed (Vercel): when GITHUB_TOKEN + GITHUB_REPO are set, reads/writes
 *   config.json in the GitHub repo via the Contents API, so the GitHub
 *   Actions worker picks up changes on its next run.
 */

const CONFIG_FILENAME = "config.json";

function githubEnv() {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // e.g. "username/ps5-stock-alert"
    if (token && repo) return { token, repo };
    return null;
}

function localConfigPath() {
    return path.join(process.cwd(), "..", CONFIG_FILENAME);
}

const GH_API_HEADERS = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
});

async function readFromGitHub(gh: { token: string; repo: string }) {
    const res = await fetch(`https://api.github.com/repos/${gh.repo}/contents/${CONFIG_FILENAME}`, {
        headers: GH_API_HEADERS(gh.token),
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { content: string; sha: string };
    const config = JSON.parse(
        Buffer.from(body.content, "base64").toString("utf-8")
    ) as TrackerConfig;
    return { config, sha: body.sha };
}

async function writeToGitHub(gh: { token: string; repo: string }, config: TrackerConfig) {
    const { sha } = await readFromGitHub(gh);
    const res = await fetch(`https://api.github.com/repos/${gh.repo}/contents/${CONFIG_FILENAME}`, {
        method: "PUT",
        headers: GH_API_HEADERS(gh.token),
        body: JSON.stringify({
            message: "chore: update tracker config from dashboard",
            content: Buffer.from(JSON.stringify(config, null, 2) + "\n").toString("base64"),
            sha,
        }),
    });
    if (!res.ok) {
        throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
    }
}

export async function readConfig(): Promise<TrackerConfig> {
    const gh = githubEnv();
    if (gh) {
        return (await readFromGitHub(gh)).config;
    }
    const raw = await fs.readFile(localConfigPath(), "utf-8");
    return JSON.parse(raw) as TrackerConfig;
}

export async function writeConfig(config: TrackerConfig): Promise<void> {
    const gh = githubEnv();
    if (gh) {
        await writeToGitHub(gh, config);
        return;
    }
    await fs.writeFile(localConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function storageMode(): "github" | "local" {
    return githubEnv() ? "github" : "local";
}
