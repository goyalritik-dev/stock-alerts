/**
 * Deep verification stage — search results routinely lie about stock
 * (stale indexes show "in stock" while the product page / cart refuses).
 * Every candidate that looks in stock must pass its site's strongest
 * available check before an alert fires:
 *
 *   cart  — real add-to-cart simulation (strongest)
 *   page  — product page buy-box / structured data
 *   none  — site has no deeper signal; alert is marked unverified
 */

export async function verifyBuyable(adapter, product, pincodes) {
    if (typeof adapter.verify !== "function") {
        return { level: "none", buyable: true, reason: "no verifier for site" };
    }
    try {
        const result = await adapter.verify(product, pincodes);
        return {
            level: result.level ?? "page",
            buyable: result.buyable === true,
            reason: result.reason ?? null,
        };
    } catch (error) {
        // Verification infrastructure failing shouldn't hide a real drop:
        // pass the product through, but flag it as unverified.
        return {
            level: "none",
            buyable: true,
            reason: `verifier errored: ${error.message}`,
        };
    }
}
