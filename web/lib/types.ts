export type SiteKey =
    | "amazon"
    | "flipkart"
    | "croma"
    | "relianceDigital"
    | "vijaySales"
    | "shopatsc"
    | "gamesTheShop"
    | "tataCliq"
    | "jiomart"
    | "blinkit"
    | "zepto"
    | "bigbasket";

export const SITE_LABELS: Record<SiteKey, string> = {
    amazon: "Amazon.in",
    flipkart: "Flipkart",
    croma: "Croma",
    relianceDigital: "Reliance Digital",
    vijaySales: "Vijay Sales",
    shopatsc: "Sony ShopAtSC",
    gamesTheShop: "Games The Shop (coming soon)",
    tataCliq: "Tata CLiQ (coming soon)",
    jiomart: "JioMart (coming soon)",
    blinkit: "Blinkit (coming soon)",
    zepto: "Zepto (coming soon)",
    bigbasket: "BigBasket (coming soon)",
};

export interface TrackerConfig {
    search: {
        queries: string[];
        includeKeywords: string[];
        excludeKeywords: string[];
        maxResultsPerSite: number;
    };
    price: {
        min: number;
        max: number;
    };
    pincodes: string[];
    sites: Record<SiteKey, boolean>;
    schedule: {
        intervalMinutes: number;
        realertCooldownMinutes: number;
        quietHours: {
            enabled: boolean;
            start: string;
            end: string;
        };
    };
    notifications: {
        telegram: { enabled: boolean };
        whatsapp: { enabled: boolean };
    };
}

export interface TrackerState {
    lastRunAt?: string;
    products: Record<
        string,
        {
            title: string;
            url: string;
            price: number | null;
            inStock: boolean;
            lastChecked: string;
            firstSeen: string;
            lastAlertAt: string | null;
        }
    >;
    sites: Record<
        string,
        {
            failures: number;
            lastSuccess: string | null;
            lastError: string | null;
        }
    >;
}
