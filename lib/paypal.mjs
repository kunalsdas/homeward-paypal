// PayPal Orders v2 (sandbox). Server-side only: amounts are always computed on the server.
import { randomUUID } from "node:crypto";

const BASE = "https://api-m.sandbox.paypal.com";
let cached = { token: null, exp: 0 };

async function token() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error("PayPal sandbox keys missing in .env");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal auth failed (${r.status})`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function api(method, path, body, requestId) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j?.details?.[0]?.issue || j?.name || `PayPal ${r.status}`);
    err.details = j;
    throw err;
  }
  return j;
}

export async function createOrder({ usd, description, referenceId, returnUrl, cancelUrl }) {
  const order = await api(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: referenceId,
          description: description.slice(0, 127),
          amount: { currency_code: "USD", value: usd.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Homeward",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
    `create-${referenceId}`
  );
  const approveUrl = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { orderId: order.id, approveUrl };
}

// Idempotent per order: the same PayPal-Request-Id returns the original capture on retries.
export async function captureOrder(orderId) {
  try {
    const res = await api("POST", `/v2/checkout/orders/${orderId}/capture`, undefined, `capture-${orderId}`);
    const c = res.purchase_units?.[0]?.payments?.captures?.[0];
    return { captureId: c?.id, status: c?.status };
  } catch (e) {
    // Already captured (e.g. page refreshed): read the order instead of capturing twice.
    if (e.details?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
      const o = await api("GET", `/v2/checkout/orders/${orderId}`);
      const c = o.purchase_units?.[0]?.payments?.captures?.[0];
      return { captureId: c?.id, status: c?.status };
    }
    throw e;
  }
}

export const newId = () => randomUUID().slice(0, 8);
