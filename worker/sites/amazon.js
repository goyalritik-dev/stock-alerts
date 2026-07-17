import * as cheerio from "cheerio";
import { Impit } from "impit";
import { getChromeHeaders } from "../lib/http.js";

/**
 * Amazon.in — parses the search results HTML. Amazon serves CAPTCHAs to
 * datacenter IPs sometimes; the adapter detects that and fails the run
 * for this site only (other sites are unaffected).
 *
 * Uses impit for browser-grade TLS fingerprinting (JA3/JA4) — this is
 * the #1 signal Amazon uses to detect bots from datacenter IPs.
 */
const BASE = "https://www.amazon.in";

const impit = new Impit({ browser: "chrome" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Random delay to mimic human pacing between requests. */
function humanDelay() {
    return sleep(1000 + Math.random() * 2000);
}

/** Fetch a page via impit with retries on CAPTCHA/transient errors. */
async function fetchPage(url, { referer, retries = 2 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            // Longer backoff on retry — Amazon often unblocks after a pause
            await sleep(3000 + Math.random() * 2000);
        }
        try {
            const res = await impit.fetch(url, {
                headers: getChromeHeaders(referer),
                redirect: "follow",
            });
            if (!res.ok) {
                const err = new Error(`GET ${url} -> ${res.status}`);
                err.status = res.status;
                err.blocked = [403, 429, 503].includes(res.status);
                lastError = err;
                // Retry on block-ish statuses
                if ([403, 408, 429, 500, 502, 503, 504].includes(res.status)) continue;
                throw err;
            }
            const html = await res.text();
            if (html.includes("api-services-support@amazon.com")) {
                lastError = new Error("Amazon served a CAPTCHA page");
                lastError.blocked = true;
                continue; // retry on CAPTCHA
            }
            return html;
        } catch (error) {
            if (error.blocked) {
                lastError = error;
                continue;
            }
            // Network/timeout errors — retryable
            lastError = error;
            lastError.transient = true;
        }
    }
    throw lastError;
}

export default {
    key: "amazon",
    label: "Amazon.in",

    /**
     * PDP check: requires the actual add-to-cart/buy-now buttons and no
     * "Currently unavailable" box. Also checks the #availability span
     * for explicit stock status text.
     */
    async verify(product) {
        const html = await fetchPage(product.url, { referer: `${BASE}/s?k=ps5+console` });
        const hasAddToCart = /id="add-to-cart-button"/.test(html);
        const hasBuyNow = /id="buy-now-button"/.test(html);
        const unavailable = /currently unavailable|out of stock/i.test(html);
        const tempUnavailable = /temporarily out of stock/i.test(html);
        const buyable = (hasAddToCart || hasBuyNow) && !unavailable && !tempUnavailable;
        return {
            level: "page",
            buyable,
            reason: buyable
                ? "PDP has cart/buy buttons"
                : `addToCart=${hasAddToCart} buyNow=${hasBuyNow} unavailable=${unavailable} tempUnavail=${tempUnavailable}`,
        };
    },

    /**
     * Pincode serviceability — fetches the PDP with a delivery-location
     * cookie/header and checks whether Amazon shows a delivery promise
     * or "Currently unavailable" for that pincode. Amazon's "Deliver to"
     * widget is driven by cookies; we pass the pincode via the
     * `x-main` / delivery address mechanism.
     */
    async checkPincodes(product, pincodes) {
        const map = {};
        for (const pin of pincodes) {
            try {
                const res = await impit.fetch(product.url, {
                    headers: {
                        ...getChromeHeaders(`${BASE}/s?k=ps5+console`),
                        cookie: `session-token=dummy; ubid-acbin=dummy; x-acbin="${pin}"`,
                    },
                    redirect: "follow",
                });
                if (!res.ok) {
                    map[pin] = null;
                    continue;
                }
                const html = await res.text();
                if (html.includes("api-services-support@amazon.com")) {
                    map[pin] = null; // CAPTCHA — can't determine
                    continue;
                }
                // Look for delivery-related indicators
                const hasDeliveryPromise = /deliver(y|ed|ing)\s+(to|by)/i.test(html);
                const unavailable =
                    /currently unavailable|out of stock|temporarily out of stock/i.test(html);
                const hasAddToCart = /id="add-to-cart-button"/.test(html);

                // If the product has add-to-cart and delivery info, it's serviceable
                map[pin] = hasAddToCart && !unavailable && hasDeliveryPromise;
                await humanDelay();
            } catch {
                map[pin] = null;
            }
        }
        return map;
    },

    async search(query) {
        const url = `${BASE}/s?k=${encodeURIComponent(query)}`;
        let html = "";
        // Amazon occasionally serves an empty page variant; retry once.
        for (let attempt = 1; attempt <= 2; attempt++) {
            html = await fetchPage(url, { referer: `${BASE}/` });
            if (html.includes("s-search-result")) break;
            if (attempt === 1) await sleep(2000 + Math.random() * 1000);
        }

        const $ = cheerio.load(html);
        const results = [];

        $('div[data-component-type="s-search-result"][data-asin]').each((_, el) => {
            const tile = $(el);
            const asin = tile.attr("data-asin");
            if (!asin) return;

            const title = tile.find("h2 span").first().text().trim();
            if (!title) return;

            const priceText = tile.find(".a-price .a-price-whole").first().text();
            const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ""), 10) : null;

            const tileText = tile.text();
            const unavailable =
                /currently unavailable|out of stock/i.test(tileText) || price === null;

            results.push({
                site: this.key,
                siteLabel: this.label,
                id: asin,
                title,
                url: `${BASE}/dp/${asin}`,
                price,
                inStock: !unavailable,
            });
        });

        return results;
    },
};
