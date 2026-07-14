/**
 * Maps Indian pincodes to the city names used by retailers with
 * city-level inventory (currently Vijay Sales). Prefix-based: the
 * first 3 digits identify the postal region.
 */
const PREFIX_TO_CITY = {
    110: "DELHI",
    120: "FARIDABAD",
    121: "FARIDABAD",
    122: "GURGAON",
    160: "CHANDIGARH",
    201: "NOIDA", // also Ghaziabad
    226: "LUCKNOW",
    302: "JAIPUR",
    380: "AHMEDABAD",
    395: "SURAT",
    400: "MUMBAI",
    401: "MUMBAI", // Thane/Vasai region
    410: "PUNE",
    411: "PUNE",
    440: "NAGPUR",
    452: "INDORE",
    500: "HYDERABAD",
    560: "BANGALORE",
    600: "CHENNAI",
    682: "KOCHI",
    700: "KOLKATA",
};

export function cityForPincode(pincode) {
    return PREFIX_TO_CITY[String(pincode).slice(0, 3)] ?? null;
}

/**
 * Runs a site's pincode check for all configured pincodes.
 * Returns:
 *   { supported: false }                          — site can't check pincodes
 *   { supported: true, serviceable: ["110001"] }  — which pincodes it ships to
 */
export async function checkServiceability(adapter, product, pincodes) {
    if (typeof adapter.checkPincodes !== "function") {
        return { supported: false };
    }
    try {
        const map = await adapter.checkPincodes(product, pincodes);
        if (!map) return { supported: false };
        return {
            supported: true,
            serviceable: pincodes.filter((pin) => map[pin] === true),
        };
    } catch (error) {
        console.error(`[${adapter.key}] pincode check failed: ${error.message}`);
        return { supported: false };
    }
}
