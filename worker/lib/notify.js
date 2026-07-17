/**
 * Notification channels. Secrets come from env (GitHub Actions secrets
 * in production, worker/.env locally — never from config.json).
 * Channels without credentials are skipped silently; the console
 * line always prints so runs are auditable in the Actions log.
 */

function inQuietHours(quietHours, now = new Date()) {
    if (!quietHours?.enabled) return false;
    // Interpret quiet hours in IST regardless of runner timezone
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const minutes = ist.getHours() * 60 + ist.getMinutes();
    const [sh, sm] = quietHours.start.split(":").map(Number);
    const [eh, em] = quietHours.end.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end; // overnight window e.g. 23:00-07:00
}

function formatMessage(product, serviceability, verification) {
    const price = product.price ? `₹${product.price.toLocaleString("en-IN")}` : "price unknown";
    let pin = "";
    if (serviceability?.supported) {
        pin = `\nDelivers to: ${serviceability.serviceable.join(", ")}`;
    } else {
        pin = "\n(delivery to your pincode not verified — check on site)";
    }
    const check =
        verification?.level === "cart"
            ? "\n✅ verified: added to cart successfully"
            : verification?.level === "page"
            ? "\n✅ verified on product page"
            : "\n⚠️ based on search results only — verify quickly";
    return `🎮 PS5 IN STOCK — ${product.siteLabel ?? product.site}\n${
        product.title
    }\n${price}${check}${pin}\n${product.url}`;
}

async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return "skipped (no credentials)";
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    return res.ok ? "sent" : `failed (${res.status})`;
}

async function sendWhatsApp(text) {
    const phone = process.env.CALLMEBOT_PHONE;
    const apikey = process.env.CALLMEBOT_APIKEY;
    if (!phone || !apikey) return "skipped (no credentials)";
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
        phone
    )}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    return res.ok ? "sent" : `failed (${res.status})`;
}

async function sendSMS(text, phone) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !twilioPhone) return "skipped (no credentials)";
    if (!phone) return "skipped (no phone number configured)";

    const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

    try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
                Authorization: auth,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                From: twilioPhone,
                To: phone,
                Body: text,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
            return `${phone}: sent`;
        } else {
            const errBody = await res.text();
            return `${phone}: failed (${res.status} ${errBody})`;
        }
    } catch (e) {
        return `${phone}: failed (${e.message})`;
    }
}

async function dispatch(text, config) {
    if (inQuietHours(config.schedule?.quietHours)) {
        console.log("(quiet hours active — push notifications suppressed)");
        return;
    }
    const results = [];
    if (config.notifications?.telegram?.enabled) {
        results.push(["telegram", await sendTelegram(text)]);
    }
    if (config.notifications?.whatsapp?.enabled) {
        results.push(["whatsapp", await sendWhatsApp(text)]);
    }
    if (config.notifications?.sms?.enabled) {
        results.push(["sms", await sendSMS(text, config.notifications.sms.phone)]);
    }
    for (const [channel, status] of results) {
        console.log(`notify ${channel}: ${status}`);
    }
}

export async function notifyStockAlert(product, config, serviceability, verification) {
    const text = formatMessage(product, serviceability, verification);
    console.log(`\n=== STOCK ALERT ===\n${text}\n===================`);
    await dispatch(text, config);
}

/** Operational warnings (site failure streaks etc.) — Telegram only. */
export async function notifyWarning(text, config) {
    console.warn(text);
    if (config.notifications?.telegram?.enabled) {
        console.log(`notify telegram: ${await sendTelegram(text)}`);
    }
}
