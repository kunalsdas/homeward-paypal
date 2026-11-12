# Homeward

Send money home by writing it the way you'd say it, in any language.
Pay with **PayPal**, delivered in seconds as **PYUSD** (PayPal USD) on Solana, with a public receipt the family can check.

> Sandbox / devnet prototype. No real money moves.

**Demo video:** _add YouTube link_ · **Live demo:** _add hosted URL_

## Why

Millions of people send money home every month. It is still slow (days), confusing, and a favourite target for scams
("pay the visa fee today or else"). Homeward makes it one sentence, settles in seconds, gives the family a receipt
they can verify themselves, and stops to warn you when a request looks like a scam.

## How it works

1. **You write a request**, e.g. `Send ₹2,000 to Mom for her medicine` (any language).
2. **An AI model (free models on OpenRouter; NVIDIA Nemotron 3.5 Super by default, with Gemma 4 and ERNIE 5.5 as fallbacks)** turns it into a structured transfer (recipient, amount, currency, purpose) and checks the text for common remittance-scam warning signs. If any are found, you must confirm before paying.
3. **Code, not AI, decides the money:** amount conversion, limits and treasury balance are checked on the server.
4. **PayPal Checkout** (Orders v2, sandbox): you approve and the server captures the payment.
5. **PYUSD is released only if PayPal reports the capture as `COMPLETED`**, then sent on Solana devnet to the recipient's wallet.
6. **Receipt page**: live status, PayPal capture ID and a Solana Explorer link the family can open.

The app keeps a pre-funded PYUSD balance on devnet and pays out of it after PayPal confirms the payment. PayPal sandbox dollars are not converted into PYUSD.

### Safety by design

- The AI never moves money. It returns structured fields; the server validates them (schema check) and does all arithmetic.
- Rupee requests round the dollar charge **up** to the cent, so the family never receives less than asked.
- Captures are idempotent (`PayPal-Request-Id`), and a transfer is settled at most once even if PayPal redirects twice or the page reloads.
- PYUSD is sent only after a `COMPLETED` capture. `PENDING` or failed payments send nothing.
- Requests with scam warning signs keep the Pay button locked until the sender confirms they know the recipient.
- Demo limits: $1–$50 per transfer, and never more than the treasury holds.

## Project structure

```
server.mjs          Express server: quote → PayPal order → capture → PYUSD release
lib/ai.mjs          Request understanding + scam check (OpenRouter, fallback across free models)
lib/paypal.mjs      PayPal Orders v2: create, idempotent capture
lib/pyusd.mjs       PYUSD (Token-2022) transfers on Solana devnet
lib/contacts.mjs    Saved recipients and the display rate
lib/store.mjs       JSON file store for transfers
public/             Minimal UI: compose, review, live receipt
scripts/            Standalone checks (PayPal, PYUSD mint, wallets)
```

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials (Sandbox). Use an app linked to a **US** sandbox business account. |
| `OPENROUTER_API_KEY` | openrouter.ai/keys (free models, no credit needed) |

Create devnet wallets and fund the treasury:

```bash
node scripts/wallets.mjs
```

Send devnet SOL (faucet.solana.com) and test PYUSD on **Solana Devnet** (faucet.paxos.com) to the printed treasury address.

## Run

```bash
npm start
```

Open http://localhost:3000. At PayPal, approve with your US **personal** sandbox account.

## Checks

```bash
node scripts/check-pyusd-mint.mjs      # PYUSD exists on devnet
node scripts/wallets.mjs               # balances
node scripts/paypal-check.mjs 10       # PayPal create → approve → capture
```

## Built with

- **PayPal**: Orders v2 (create, capture), sandbox
- **PYUSD** (PayPal USD) on Solana devnet, Token-2022
- **OpenRouter** free models (NVIDIA Nemotron 3.5 Super, Google Gemma 4, Baidu ERNIE 5.5) for multilingual request understanding and scam-risk checks
- Node, Express, vanilla HTML/CSS/JS

## License

[MIT](LICENSE)
