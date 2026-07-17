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
export interface SiteMetadata {
    key: SiteKey;
    label: string;
    url: string;
    domain: string;
    comingSoon?: boolean;
}

export const SITES_REGISTRY: Record<SiteKey, SiteMetadata> = {
    amazon: {
        key: "amazon",
        label: "Amazon.in",
        url: "https://www.amazon.in",
        domain: "amazon.in",
    },
    flipkart: {
        key: "flipkart",
        label: "Flipkart",
        url: "https://www.flipkart.com",
        domain: "flipkart.com",
    },
    croma: {
        key: "croma",
        label: "Croma",
        url: "https://www.croma.com",
        domain: "croma.com",
    },
    relianceDigital: {
        key: "relianceDigital",
        label: "Reliance Digital",
        url: "https://www.reliancedigital.in",
        domain: "reliancedigital.in",
        comingSoon: true,
    },
    vijaySales: {
        key: "vijaySales",
        label: "Vijay Sales",
        url: "https://www.vijaysales.com",
        domain: "vijaysales.com",
    },
    shopatsc: {
        key: "shopatsc",
        label: "Sony ShopAtSC",
        url: "https://shopatsc.com",
        domain: "shopatsc.com",
    },
    bigbasket: {
        key: "bigbasket",
        label: "BigBasket",
        url: "https://www.bigbasket.com",
        domain: "bigbasket.com",
    },
    blinkit: {
        key: "blinkit",
        label: "Blinkit",
        url: "https://blinkit.com",
        domain: "blinkit.com",
    },
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
        telegram: { enabled: boolean; phone: string };
        whatsapp: { enabled: boolean; phone: string };
        sms: { enabled: boolean; phone: string };
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
