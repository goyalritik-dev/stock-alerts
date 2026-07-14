/**
 * Title matching: every include group must match (a group like
 * "playstation 5|ps5" matches if ANY alternative is present),
 * and no exclude keyword may appear.
 */
export function titleMatches(title, includeKeywords, excludeKeywords) {
    const t = title.toLowerCase();
    const includeOk = includeKeywords.every((group) =>
        group
            .toLowerCase()
            .split("|")
            .some((alt) => t.includes(alt.trim()))
    );
    if (!includeOk) return false;
    return !excludeKeywords.some((kw) => t.includes(kw.toLowerCase()));
}

export function priceInBand(price, band) {
    if (price == null) return true; // unknown price -> let it through, verify later
    return price >= band.min && price <= band.max;
}

/** Filter raw search results down to real PS5 console candidates. */
export function filterCandidates(results, config) {
    const { includeKeywords, excludeKeywords } = config.search;
    return results.filter(
        (r) =>
            titleMatches(r.title, includeKeywords, excludeKeywords) &&
            priceInBand(r.price, config.price)
    );
}
