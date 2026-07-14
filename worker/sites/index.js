import amazon from "./amazon.js";
import croma from "./croma.js";
import flipkart from "./flipkart.js";
import relianceDigital from "./reliance-digital.js";
import shopatsc from "./shopatsc.js";
import vijaySales from "./vijay-sales.js";

/** Registry of implemented site adapters, keyed as in config.json "sites". */
export const adapters = {
    amazon,
    croma,
    flipkart,
    relianceDigital,
    shopatsc,
    vijaySales,
};
