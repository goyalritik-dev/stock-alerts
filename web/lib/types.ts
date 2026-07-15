export type SiteKey =
    | "amazon"
    | "flipkart"
    | "croma"
    | "relianceDigital"
    | "vijaySales"
    | "shopatsc"
    | "bigbasket"
    | "blinkit";

export const SITE_LABELS: Record<SiteKey, string> = {
    amazon: "Amazon.in",
    flipkart: "Flipkart",
    croma: "Croma",
    relianceDigital: "Reliance Digital",
    vijaySales: "Vijay Sales",
    shopatsc: "Sony ShopAtSC",
    bigbasket: "BigBasket",
    blinkit: "Blinkit",
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
    filters?: {
        snapshot_view: string;
    };
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
