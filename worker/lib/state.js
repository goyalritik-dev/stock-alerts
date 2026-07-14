import { readFile, writeFile } from "fs/promises";
import path from "path";
import { ROOT } from "./config.js";

const STATE_PATH = path.join(ROOT, "state.json");

export async function loadState() {
    try {
        const state = JSON.parse(await readFile(STATE_PATH, "utf-8"));
        state.products ??= {};
        state.sites ??= {};
        return state;
    } catch {
        return { products: {}, sites: {} };
    }
}

export async function saveState(state) {
    state.lastRunAt = new Date().toISOString();
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Records the product's current status and returns true when an alert
 * should fire: an out-of-stock -> in-stock transition, unless the same
 * product already alerted within the cooldown window (guards against
 * sites whose stock status flaps every few minutes).
 */
export function recordAndDetectTransition(state, product, cooldownMinutes = 60) {
    const key = `${product.site}:${product.id}`;
    const previous = state.products[key];
    const now = new Date();

    state.products[key] = {
        title: product.title,
        url: product.url,
        price: product.price ?? null,
        inStock: product.inStock,
        lastChecked: now.toISOString(),
        firstSeen: previous?.firstSeen ?? now.toISOString(),
        lastAlertAt: previous?.lastAlertAt ?? null,
    };

    const wasInStock = previous?.inStock === true;
    if (!product.inStock || wasInStock) return false;

    if (previous?.lastAlertAt) {
        const minutesSinceAlert =
            (now - new Date(previous.lastAlertAt)) / 60000;
        if (minutesSinceAlert < cooldownMinutes) {
            console.log(
                `  (transition for ${key} suppressed — alerted ${Math.round(minutesSinceAlert)}m ago, cooldown ${cooldownMinutes}m)`
            );
            return false;
        }
    }

    state.products[key].lastAlertAt = now.toISOString();
    return true;
}

/**
 * Site health tracking. Returns a warning string when a failure streak
 * crosses a threshold (once at WARN_AFTER, then daily), else null.
 */
const WARN_AFTER = 12; // ~1 hour of consecutive failures at 5-min cadence
const REWARN_EVERY = 288; // ~daily

export function recordSiteResult(state, siteKey, ok, errorMessage = null) {
    const site = (state.sites[siteKey] ??= { failures: 0, lastSuccess: null, lastError: null });
    if (ok) {
        site.failures = 0;
        site.lastSuccess = new Date().toISOString();
        site.lastError = null;
        return null;
    }
    site.failures += 1;
    site.lastError = errorMessage;
    if (site.failures === WARN_AFTER || site.failures % REWARN_EVERY === 0) {
        return `⚠️ ${siteKey} has failed ${site.failures} runs in a row (last error: ${errorMessage ?? "unknown"}). It may be blocking the worker.`;
    }
    return null;
}
