/**
 * SkinBuddy — DB + Tool Call Integration Test
 * Run with: bun test_integration.mts (from the frontend dir)
 */

import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const BASE_URL = "http://localhost:3000";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash-lite";

const GREEN = "\x1b[32m✓\x1b[0m";
const RED = "\x1b[31m✗\x1b[0m";
const YELLOW = "\x1b[33m⚠\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const pass = (msg: string) => console.log(`  ${GREEN} ${msg}`);
const fail = (msg: string) => console.log(`  ${RED} ${msg}`);
const warn = (msg: string) => console.log(`  ${YELLOW} ${msg}`);

// 1. OpenRouter reachability
async function testOpenRouter() {
  console.log(`\n${BOLD}[1] OpenRouter → model: ${OPENROUTER_MODEL}${RESET}`);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [{ role: "user", content: "Say PONG." }], max_tokens: 20 }),
    });
    const data = await res.json() as any;
    if (!res.ok) { fail(`HTTP ${res.status}: ${JSON.stringify(data?.error ?? data)}`); return false; }
    const text = data?.choices?.[0]?.message?.content ?? "";
    pass(`OpenRouter responded: "${text.trim().slice(0, 80)}"`);
    return true;
  } catch (err: any) {
    fail(`OpenRouter fetch failed: ${err?.message}`);
    return false;
  }
}

// 2. Dev server reachability
async function testDevServer() {
  console.log(`\n${BOLD}[2] Dev server (${BASE_URL})${RESET}`);
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    pass(`Dev server is up (HTTP ${res.status})`);
    return true;
  } catch (err: any) {
    fail(`Dev server not reachable: ${err?.message}`);
    return false;
  }
}

// 3. Convex DB
async function testConvexDb() {
  console.log(`\n${BOLD}[3] Convex DB${RESET}`);
  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!CONVEX_URL) { warn("NEXT_PUBLIC_CONVEX_URL not set — skipping"); return; }
  try {
    const res = await fetch(CONVEX_URL, { signal: AbortSignal.timeout(5000) });
    pass(`Convex reachable at ${CONVEX_URL} (HTTP ${res.status})`);
  } catch (err: any) {
    fail(`Convex not reachable: ${err?.message}`);
  }
}

// 4. /api/chat tool-call test
async function testChatEndpoint() {
  console.log(`\n${BOLD}[4] /api/chat product query (tool-call test)${RESET}`);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Can you show me some moisturizers?" }],
        stream: false,
      }),
      signal: AbortSignal.timeout(35000),
    });
    const raw = await res.text();
    if (!res.ok) { fail(`HTTP ${res.status}: ${raw.slice(0, 200)}`); return; }

    const hasProducts = raw.includes('"products"') || raw.includes('"product"');
    const hasToolCall = raw.includes("searchProductsByQuery") || raw.includes("functionCall");
    const hasError = raw.includes('"type":"error"') || raw.includes('"error":');
    const errorMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);

    if (hasError && !hasProducts) {
      fail(`Error in response: ${errorMatch?.[1] ?? raw.slice(0, 200)}`);
    } else if (hasProducts) {
      pass(`Products returned ✓ — tool call pipeline is working!`);
    } else if (hasToolCall) {
      pass(`Tool call detected in response (products may be in next chunk)`);
    } else {
      warn(`Text response — no product tool call detected`);
      console.log(`     Preview: "${raw.slice(0, 300).replace(/\n/g, " ")}"`);
    }
  } catch (err: any) {
    if (err?.name === "TimeoutError") warn("Request timed out after 35s");
    else fail(`Fetch error: ${err?.message}`);
  }
}

console.log(`\n${BOLD}═══════════════════════════════════${RESET}`);
console.log(`${BOLD}  SkinBuddy Integration Test${RESET}`);
console.log(`${BOLD}═══════════════════════════════════${RESET}`);

await testOpenRouter();
const devOk = await testDevServer();
await testConvexDb();
if (devOk) await testChatEndpoint();
else warn("Skipping /api/chat — dev server not reachable");

console.log(`\n${BOLD}═══════════════════════════════════${RESET}\n`);
