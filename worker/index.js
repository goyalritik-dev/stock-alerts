import { loadConfig } from "./lib/config.js";
import { filterCandidates } from "./lib/matcher.js";
import { checkServiceability } from "./lib/pincode.js";
import { verifyBuyable } from "./lib/verify.js";
import { loadState, saveState, recordAndDetectTransition, recordSiteResult } from "./lib/state.js";
import { notifyStockAlert, notifyWarning } from "./lib/notify.js";
import { adapters } from "./sites/index.js";

/** Does this error look like bot-blocking rather than a broken site/worker? */
function looksBlocked(error) {
    return error?.blocked === true || /captcha|bot wall|403|429|503/i.test(error?.message ?? "");
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

/**
 * Concurrency limiter — runs async tasks with at most `limit` in flight.
 * Returns results in the same order as the input array.
 */
async function pMap(items, fn, limit = 2) {
    const results = new Array(items.length);
    let idx = 0;

    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await fn(items[i], i);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
}

/**
 * Process a single site: run all search queries in parallel, filter,
 * verify, and check pincode serviceability.
 */
async function processSite(key, adapter, config, state, cooldown) {
    const byId = new Map();
    let failures = 0;
    let blocked = 0;
    let lastError = null;

    // Run all search queries in parallel for this site
    const queryResults = await Promise.allSettled(
        config.search.queries.map((query) => adapter.search(query, { pincodes: config.pincodes }))
    );

    for (let i = 0; i < queryResults.length; i++) {
        const result = queryResults[i];
        if (result.status === "fulfilled") {
            for (const r of result.value) byId.set(r.id, r);
        } else {
            failures++;
            if (looksBlocked(result.reason)) blocked++;
            lastError = result.reason.message;
            console.error(`[${key}] search "${config.search.queries[i]}" failed: ${lastError}`);
        }
    }

    // A site "failed" this run only if every query threw.
    const siteOk = failures < config.search.queries.length;
    const isBlocked = !siteOk && blocked > 0;
    if (isBlocked) {
        lastError = `[likely bot-blocking] ${lastError}`;
    }
    const warning = recordSiteResult(state, key, siteOk, lastError);
    if (warning) await safeNotify(notifyWarning, warning, config);

    const candidates = filterCandidates([...byId.values()], config).slice(
        0,
        config.search.maxResultsPerSite
    );
    console.log(`[${key}] ${byId.size} raw result(s), ${candidates.length} matching candidate(s)`);

    let alerts = 0;

    for (const product of candidates) {
        console.log(
            `  - ${product.title} | ₹${product.price ?? "?"} | ${
                product.inStock ? "IN STOCK" : "out of stock"
            }`
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
                console.log(`    (verified [${verification.level}]: ${verification.reason})`);
            }
        }

        // Gate 2 — pincode serviceability.
        let serviceability = null;
        if (product.inStock) {
            serviceability = await checkServiceability(adapter, product, config.pincodes);
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

    return { alerts, isBlocked, ok: siteOk, error: lastError };
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

    let totalAlerts = 0;
    const blockedSites = [];
    const siteStatus = []; // { key, ok, error? } for each site

    // Process sites with controlled concurrency (2 at a time).
    // This cuts total runtime ~3-4× without overwhelming retailers.
    const siteResults = await pMap(
        active,
        async (key) => {
            const adapter = adapters[key];
            try {
                return await processSite(key, adapter, config, state, cooldown);
            } catch (error) {
                console.error(`[${key}] site processing failed: ${error.message}`);
                recordSiteResult(state, key, false, error.message);
                return { alerts: 0, isBlocked: false, ok: false, error: error.message };
            }
        },
        2 // concurrency limit
    );

    for (let i = 0; i < active.length; i++) {
        const { alerts, isBlocked, ok, error } = siteResults[i];
        totalAlerts += alerts;
        if (isBlocked) blockedSites.push(active[i]);
        siteStatus.push({ key: active[i], ok, error });
    }

    await saveState(state);

    // ── Site status summary ──────────────────────────────────────────
    const successful = siteStatus.filter((s) => s.ok);
    const failed = siteStatus.filter((s) => !s.ok);

    console.log("\n── Site Status Summary ──────────────────────────");
    if (successful.length) {
        console.log(
            `  ✓ Successful (${successful.length}): ${successful.map((s) => s.key).join(", ")}`
        );
    }
    if (failed.length) {
        console.log(`  ✗ Failed (${failed.length}):`);
        for (const s of failed) {
            console.log(`      ${s.key}: ${s.error}`);
        }
    }
    if (blockedSites.length) {
        console.log(`  ⚠ Likely bot-blocked: ${blockedSites.join(", ")}`);
    }
    console.log("─────────────────────────────────────────────────");
    console.log(`\nRun complete. ${totalAlerts} alert(s) sent. State saved.`);
}

// Exit codes: blocked/flaky retailer sites are contained above and exit 0
// (CI stays green; site health lives in state.json). Only real
// infrastructure failures — unreadable config, state not writable,
// crashes in the worker itself — reach this handler and exit 1.
run().catch((error) => {
    console.error("Worker failed (infrastructure):", error);
    process.exit(1);
});
