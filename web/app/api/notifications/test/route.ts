import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { type } = (await request.json()) as { type?: string };
        if (!type || !["telegram", "whatsapp", "sms"].includes(type)) {
            return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
        }

        const config = await readConfig();
        const testMessage = `🔔 Test Alert from Stock Tracker! If you received this, your ${type.toUpperCase()} notification channel is working correctly.`;

        if (type === "telegram") {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;
            if (!token || !chatId) {
                return NextResponse.json(
                    {
                        error: "Telegram credentials (bot token or chat ID) are not configured in your env.",
                    },
                    { status: 400 }
                );
            }

            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: testMessage,
                    disable_web_page_preview: false,
                }),
            });

            if (!res.ok) {
                const errBody = await res.text();
                return NextResponse.json(
                    { error: `Telegram sending failed: status ${res.status} - ${errBody}` },
                    { status: 500 }
                );
            }

            return NextResponse.json({ ok: true, status: "sent" });
        }

        if (type === "whatsapp") {
            const phone = process.env.CALLMEBOT_PHONE;
            const apikey = process.env.CALLMEBOT_APIKEY;
            if (!phone || !apikey) {
                return NextResponse.json(
                    {
                        error: "WhatsApp (CallMeBot phone or API key) credentials are not configured in your env.",
                    },
                    { status: 400 }
                );
            }

            const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
                phone
            )}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(testMessage)}`;

            const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) {
                return NextResponse.json(
                    { error: `WhatsApp sending failed: status ${res.status}` },
                    { status: 500 }
                );
            }

            return NextResponse.json({ ok: true, status: "sent" });
        }

        if (type === "sms") {
            const sid = process.env.TWILIO_ACCOUNT_SID;
            const token = process.env.TWILIO_AUTH_TOKEN;
            const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
            const recipientPhone = config.notifications.sms?.phone;

            if (!sid || !token || !twilioPhone) {
                return NextResponse.json(
                    { error: "Twilio credentials are not configured on the server." },
                    { status: 400 }
                );
            }
            if (!recipientPhone) {
                return NextResponse.json(
                    { error: "SMS phone number is not configured in settings." },
                    { status: 400 }
                );
            }

            const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
            const res = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
                {
                    method: "POST",
                    headers: {
                        Authorization: auth,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({
                        From: twilioPhone,
                        To: recipientPhone,
                        Body: testMessage,
                    }),
                    signal: AbortSignal.timeout(10000),
                }
            );

            if (!res.ok) {
                const errBody = await res.text();
                return NextResponse.json(
                    { error: `SMS sending failed: status ${res.status} - ${errBody}` },
                    { status: 500 }
                );
            }

            return NextResponse.json({ ok: true, status: "sent", phone: recipientPhone });
        }

        return NextResponse.json({ error: "Unsupported channel type" }, { status: 400 });
    } catch (error: any) {
        console.error("Test notification error:", error);
        return NextResponse.json(
            { error: error.message ?? "An error occurred while sending the test notification." },
            { status: 500 }
        );
    }
}
