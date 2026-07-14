/**
 * HTTP layer with bot-blocking resilience. Datacenter IPs (GitHub
 * Actions) get blocked far more often than residential ones, so every
 * request:
 *   - sends a realistic browser identity, rotated per attempt
 *   - retries transient/block-ish responses with backoff + jitter
 *   - tags block-type failures (error.blocked) so callers can report
 *     "site is blocking us" instead of treating it as infrastructure
 */

const USER_AGENTS = [
    // Chrome / macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    // Chrome / Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    // Edge / Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    // Firefox / Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    // Safari / macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
];

// Start at a random offset so consecutive runs don't always lead with
// the same identity.
let uaIndex = Math.floor(Math.random() * USER_AGENTS.length);

function nextUserAgent() {
    uaIndex = (uaIndex + 1) % USER_AGENTS.length;
    return USER_AGENTS[uaIndex];
}

function baseHeaders() {
    return {
        "User-Agent": nextUserAgent(),
        Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-IN,en;q=0.9",
    };
}

/** HTTP statuses that indicate blocking / rate limiting rather than a broken site. */
const BLOCK_STATUSES = new Set([403, 429, 503]);
/** Statuses worth retrying (blocks may be per-IP-per-moment; 5xx may be transient). */
const RETRY_STATUSES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpError(url, status) {
    const error = new Error(`GET ${url} -> ${status}`);
    error.status = status;
    error.blocked = BLOCK_STATUSES.has(status);
    return error;
}

/**
 * GET with rotating UA and up to `retries` extra attempts on transient
 * failures (timeouts, network errors, retryable statuses). Backoff is
 * exponential with jitter: ~1s, ~3s.
 */
export async function get(url, { headers = {}, timeoutMs = 12000, retries = 2 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            const backoff = 1000 * 3 ** (attempt - 1);
            await sleep(backoff + Math.random() * 500);
        }
        let res;
        try {
            res = await fetch(url, {
                headers: { ...baseHeaders(), ...headers },
                signal: AbortSignal.timeout(timeoutMs),
                redirect: "follow",
            });
        } catch (error) {
            // Timeouts and network resets — retryable.
            lastError = Object.assign(error, { transient: true });
            continue;
        }
        if (res.ok) return res;
        lastError = httpError(url, res.status);
        if (!RETRY_STATUSES.has(res.status)) throw lastError;
    }
    throw lastError;
}

export async function getJson(url, options = {}) {
    const res = await get(url, {
        ...options,
        headers: { Accept: "application/json", ...options.headers },
    });
    return res.json();
}

export async function getText(url, options = {}) {
    const res = await get(url, options);
    return res.text();
}
