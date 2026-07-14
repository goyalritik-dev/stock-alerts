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

    for (const key of active) {
        const adapter = adapters[key];
        const byId = new Map();
        let failures = 0;
        let lastError = null;

        for (const query of config.search.queries) {
            try {
                const results = await adapter.search(query);
                for (const r of results) byId.set(r.id, r);
            } catch (error) {
                failures++;
                lastError = error.message;
                console.error(`[${key}] search "${query}" failed: ${error.message}`);
            }
        }

        // A site "failed" this run only if every query threw.
        const siteOk = failures < config.search.queries.length;
        const warning = recordSiteResult(state, key, siteOk, lastError);
        if (warning) await notifyWarning(warning, config);

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
                await notifyStockAlert(product, config, serviceability, verification);
            }
        }
    }

    await saveState(state);
    console.log(`\nRun complete. ${alerts} alert(s) sent. State saved.`);
}

run().catch((error) => {
    console.error("Worker failed:", error);
    process.exit(1);
});
