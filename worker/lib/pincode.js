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
 * Approx lat/long for a pincode's region — enough for quick-commerce
 * location context (they resolve to the nearest dark store). Falls back
 * to Delhi if the prefix is unknown.
 */
const PREFIX_TO_LATLONG = {
    110: [28.6139, 77.209], // Delhi
    120: [28.4089, 77.3178], // Faridabad
    122: [28.4595, 77.0266], // Gurgaon
    160: [30.7333, 76.7794], // Chandigarh
    201: [28.5355, 77.391], // Noida
    226: [26.8467, 80.9462], // Lucknow
    302: [26.9124, 75.7873], // Jaipur
    380: [23.0225, 72.5714], // Ahmedabad
    395: [21.1702, 72.8311], // Surat
    400: [19.076, 72.8777], // Mumbai
    410: [18.5204, 73.8567], // Pune
    411: [18.5204, 73.8567], // Pune
    440: [21.1458, 79.0882], // Nagpur
    452: [22.7196, 75.8577], // Indore
    500: [17.385, 78.4867], // Hyderabad
    560: [12.9716, 77.5946], // Bangalore
    600: [13.0827, 80.2707], // Chennai
    682: [9.9312, 76.2673], // Kochi
    700: [22.5726, 88.3639], // Kolkata
};

export function latLongForPincode(pincode) {
    return PREFIX_TO_LATLONG[String(pincode).slice(0, 3)] ?? [28.6139, 77.209];
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
