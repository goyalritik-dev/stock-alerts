import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { DashboardProvider } from "@/lib/dashboard-context";
import "./globals.css";

const poppins = Poppins({
    weight: ["400", "500", "600", "700", "800"],
    variable: "--font-poppins",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "PS5 Stock Alert",
    description: "Configuration dashboard for the PS5 India stock tracker",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">
                <DashboardProvider>{children}</DashboardProvider>
            </body>
        </html>
    );
}
