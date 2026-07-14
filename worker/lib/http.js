const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-IN,en;q=0.9",
};

export async function get(url, { headers = {}, timeoutMs = 15000 } = {}) {
    const res = await fetch(url, {
        headers: { ...BROWSER_HEADERS, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
    });
    if (!res.ok) {
        throw new Error(`GET ${url} -> ${res.status}`);
    }
    return res;
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
