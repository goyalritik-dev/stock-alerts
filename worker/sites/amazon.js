import * as cheerio from "cheerio";
import { getText } from "../lib/http.js";

/**
 * Amazon.in — parses the search results HTML. Amazon serves CAPTCHAs to
 * datacenter IPs sometimes; the adapter detects that and fails the run
 * for this site only (other sites are unaffected).
 */
const BASE = "https://www.amazon.in";

export default {
    key: "amazon",
    label: "Amazon.in",

    /**
     * PDP check: requires the actual add-to-cart/buy-now buttons and no
     * "Currently unavailable" box. Search tiles often show stale prices
     * for delisted consoles.
     */
    async verify(product) {
        const html = await getText(product.url, {
            headers: { "Upgrade-Insecure-Requests": "1" },
        });
        if (html.includes("api-services-support@amazon.com")) {
            return { level: "page", buyable: false, reason: "CAPTCHA on PDP" };
        }
        const hasAddToCart = /id="add-to-cart-button"/.test(html);
        const hasBuyNow = /id="buy-now-button"/.test(html);
        const unavailable = /currently unavailable|out of stock/i.test(html);
        const buyable = (hasAddToCart || hasBuyNow) && !unavailable;
        return {
            level: "page",
            buyable,
            reason: buyable
                ? "PDP has cart/buy buttons"
                : `addToCart=${hasAddToCart} buyNow=${hasBuyNow} unavailable=${unavailable}`,
        };
    },

    async search(query) {
        let html = "";
        // Amazon occasionally serves an empty page variant; retry once.
        for (let attempt = 1; attempt <= 2; attempt++) {
            html = await getText(`${BASE}/s?k=${encodeURIComponent(query)}`, {
                headers: { "Upgrade-Insecure-Requests": "1" },
            });
            if (html.includes("api-services-support@amazon.com")) {
                throw new Error("Amazon served a CAPTCHA page");
            }
            if (html.includes("s-search-result")) break;
            if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
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
