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
    | "poorvika"
    | "sangeetha";

export const SITE_LABELS: Record<SiteKey, string> = {
    amazon: "Amazon.in",
    flipkart: "Flipkart",
    croma: "Croma",
    relianceDigital: "Reliance Digital",
    vijaySales: "Vijay Sales",
    shopatsc: "Sony ShopAtSC",
    gamesTheShop: "Games The Shop",
    tataCliq: "Tata CLiQ",
    jiomart: "JioMart",
    poorvika: "Poorvika",
    sangeetha: "Sangeetha",
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
