import { loadConfig } from "./lib/config.js";
import { filterCandidates } from "./lib/matcher.js";
import { checkServiceability } from "./lib/pincode.js";
import { verifyBuyable } from "./lib/verify.js";
import {
    loadState,
    saveState,
    recordAndDetectTransition,
    recordSiteResult,
} from "./lib/state.js";
import { notifyStockAlert, notifyWarning } from "./lib/notify.js";
import { adapters } from "./sites/index.js";

/** Does this error look like bot-blocking rather than a broken site/worker? */
function looksBlocked(error) {
    return (
        error?.blocked === true ||
        /captcha|bot wall|403|429|503/i.test(error?.message ?? "")
    );
}

/**
 * Notification failures (Telegram down, network blip) shouldn't abort
 * the run mid-loop and lose the rest of the sites; log and move on.
 */
async function safeNotify(fn, ...args) {
    try {
        await fn(...args);
    } catch (error) {
        console.error(`notify failed: ${error.message}`);
    }
}

async function run() {
    const config = await loadConfig();
    const state = await loadState();
    const cooldown = config.schedule?.realertCooldownMinutes ?? 60;

    const enabledSites = Object.entries(config.sites)
        .filter(([, on]) => on)
        .map(([key]) => key);
    const active = enabledSites.filter((key) => adapters[key]);
    const missing = enabledSites.filter((key) => !adapters[key]);

    console.log(`Sites: ${active.join(", ") || "(none)"}`);
    if (missing.length) console.log(`(adapters not implemented yet: ${missing.join(", ")})`);

    let alerts = 0;
    const blockedSites = [];

    for (const key of active) {
        const adapter = adapters[key];
        const byId = new Map();
        let failures = 0;
        let blocked = 0;
        let lastError = null;

        for (const query of config.search.queries) {
            try {
                const results = await adapter.search(query, { pincodes: config.pincodes });
                for (const r of results) byId.set(r.id, r);
            } catch (error) {
                failures++;
                if (looksBlocked(error)) blocked++;
                lastError = error.message;
                console.error(`[${key}] search "${query}" failed: ${error.message}`);
            }
        }

        // A site "failed" this run only if every query threw.
        const siteOk = failures < config.search.queries.length;
        if (!siteOk && blocked > 0) {
            blockedSites.push(key);
            lastError = `[likely bot-blocking] ${lastError}`;
        }
        const warning = recordSiteResult(state, key, siteOk, lastError);
        if (warning) await safeNotify(notifyWarning, warning, config);

        const candidates = filterCandidates([...byId.values()], config).slice(
            0,
            config.search.maxResultsPerSite
        );
        console.log(
            `[${key}] ${byId.size} raw result(s), ${candidates.length} matching candidate(s)`
        );

        for (const product of candidates) {
            console.log(
                `  - ${product.title} | ₹${product.price ?? "?"} | ${product.inStock ? "IN STOCK" : "out of stock"}`
            );

            // Gate 1 — deep verification: search indexes lie, so anything that
            // looks in stock must pass the product-page / cart check.
            let verification = null;
            if (product.inStock) {
                verification = await verifyBuyable(adapter, product, config.pincodes);
                if (!verification.buyable) {
                    console.log(
                        `    (failed ${verification.level} verification: ${verification.reason} — no alert)`
                    );
                    product.inStock = false;
                } else {
                    console.log(
                        `    (verified [${verification.level}]: ${verification.reason})`
                    );
                }
            }

            // Gate 2 — pincode serviceability.
            let serviceability = null;
            if (product.inStock) {
                serviceability = await checkServiceability(
                    adapter,
                    product,
                    config.pincodes
                );
                if (serviceability.supported && serviceability.serviceable.length === 0) {
                    console.log(
                        `    (in stock but not deliverable to ${config.pincodes.join(", ")} — no alert)`
                    );
                    product.inStock = false; // treat as unavailable *for the user*
                }
            }

            const shouldAlert = recordAndDetectTransition(state, product, cooldown);
            if (shouldAlert) {
                alerts++;
                await safeNotify(notifyStockAlert, product, config, serviceability, verification);
            }
        }
    }

    await saveState(state);

    if (blockedSites.length) {
        console.warn(
            `\nLikely bot-blocking this run: ${blockedSites.join(", ")}. ` +
            "Expected from datacenter IPs (GitHub Actions); the failure-streak " +
            "warning in state.json fires if it persists. Not an infrastructure failure."
        );
    }
    console.log(`\nRun complete. ${alerts} alert(s) sent. State saved.`);
}

// Exit codes: blocked/flaky retailer sites are contained above and exit 0
// (CI stays green; site health lives in state.json). Only real
// infrastructure failures — unreadable config, state not writable,
// crashes in the worker itself — reach this handler and exit 1.
run().catch((error) => {
    console.error("Worker failed (infrastructure):", error);
    process.exit(1);
});
