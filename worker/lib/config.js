import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function loadConfig() {
    const raw = await readFile(path.join(ROOT, "config.json"), "utf-8");
    return JSON.parse(raw);
}

export { ROOT };
