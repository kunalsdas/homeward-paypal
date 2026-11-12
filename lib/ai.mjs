// Turns a free-text request (any language) into a structured transfer and a scam-risk check.
// The AI only reads and explains; amounts, limits and money movement are decided in code.
// Uses free models on OpenRouter, with automatic fallback between them.
import { z } from "zod";

export const MODELS = (process.env.OPENROUTER_MODELS ||
  "nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free,baidu/ernie-5.5-flash-preview:free")
  .split(",").map((s) => s.trim()).filter(Boolean);

const Parsed = z.object({
  understood: z.boolean(),
  recipient: z.string(),
  amount: z.number(),
  currency: z.enum(["INR", "USD"]),
  purpose: z.string(),
  language: z.string(),
  risk: z.object({
    level: z.enum(["low", "medium", "high"]),
    reasons: z.array(z.string()),
  }),
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["understood", "recipient", "amount", "currency", "purpose", "language", "risk"],
  properties: {
    understood: { type: "boolean", description: "false if this is not a request to send money" },
    recipient: { type: "string", description: "Who receives the money, in English, e.g. 'Mom' for माँ / amma / mummy" },
    amount: { type: "number", description: "Numeric amount asked for; 0 if missing" },
    currency: { type: "string", enum: ["INR", "USD"] },
    purpose: { type: "string", description: "Short purpose in English, 1-4 words" },
    language: { type: "string", description: "Language of the request, e.g. 'Hindi'" },
    risk: {
      type: "object",
      additionalProperties: false,
      required: ["level", "reasons"],
      properties: {
        level: { type: "string", enum: ["low", "medium", "high"] },
        reasons: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const SYSTEM = `You read money-transfer requests written by people sending money to family abroad.
Extract who it is for, the amount and currency (₹, rs, rupees, lakh => INR; $, dollars => USD), and a short purpose in English.
"1 lakh" = 100000. Requests may be in any language or mix of languages.

Also check the text for common remittance-scam warning signs, for example: paying someone the sender has not met,
urgent pressure or threats, payment for a job, visa, prize, lottery, investment or crypto return, romance contacts,
someone claiming to be police, a bank or tax office, or being asked to keep it secret.
A normal family transfer (medicine, school fees, rent, groceries, a festival gift) is low risk with no reasons.
Only report warning signs actually present in the text. Never invent details.

Reply with only a JSON object matching this schema:
${JSON.stringify(SCHEMA)}`;

function extractJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("no JSON in model reply");
  return JSON.parse(text.slice(s, e + 1));
}

export async function parseRequest(text, { models = MODELS } = {}) {
  // Use only this project's key from .env.
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw Object.assign(new Error("OPENROUTER_API_KEY missing in .env"), { code: "NO_KEY" });

  // Try each free model in turn: covers rate limits, outages and malformed replies.
  let lastErr;
  for (const model of models) {
    try {
      return await callModel(key, model, text);
    } catch (e) {
      lastErr = e;
      console.warn(`AI ${model} failed: ${e.message}`);
    }
  }
  throw lastErr;
}

async function callModel(key, model, text) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Homeward",
    },
    body: JSON.stringify({
      model,
      reasoning: { enabled: false }, // simple extraction: fast replies, same accuracy in tests
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${j?.error?.message || "request failed"}`);
  const content = j.choices?.[0]?.message?.content || "";
  const parsed = Parsed.safeParse(extractJson(content));
  if (!parsed.success) throw new Error("model reply did not match the schema");
  return { ...parsed.data, model: j.model };
}
