import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://doonleith.github.io";
const categories = {
  income: ["Salary", "Freelance", "Benefits", "Interest", "Other"],
  expense: ["Rent", "Mortgage", "Council tax", "Gas & electric", "Water", "Internet & mobile", "Insurance", "Debt payments", "Savings", "Disposable Income", "Subscriptions", "Groceries", "Transport", "Health", "Other"],
};

const tools = [
  { type: "function", function: { name: "get_month_summary", description: "Get total income, spending, and left to spend for a month in the active money space.", parameters: { type: "object", properties: { month: { type: "string", description: "Month in YYYY-MM format." } }, required: ["month"], additionalProperties: false } } },
  { type: "function", function: { name: "get_spending_breakdown", description: "Get expense category totals for a month in the active money space.", parameters: { type: "object", properties: { month: { type: "string", description: "Month in YYYY-MM format." } }, required: ["month"], additionalProperties: false } } },
  { type: "function", function: { name: "find_transactions", description: "Find transactions in the active money space. Use this for questions about specific purchases or payments.", parameters: { type: "object", properties: { month: { type: "string", description: "Month in YYYY-MM format." }, query: { type: "string", description: "A word or short phrase to match against transaction notes and categories." }, type: { type: "string", enum: ["income", "expense"] } }, required: ["month"], additionalProperties: false } } },
  { type: "function", function: { name: "draft_transaction", description: "Prepare, but never save, a transaction after the user asks to add one. Ask a concise follow-up only when the amount, type, or category is missing. Default to today and a one-off transaction unless the user says otherwise.", parameters: { type: "object", properties: { type: { type: "string", enum: ["income", "expense"] }, amount: { type: "number", minimum: 0.01 }, category: { type: "string" }, date: { type: "string", description: "Date in YYYY-MM-DD format. Omit to use today." }, note: { type: "string" }, repeat_monthly: { type: "boolean", description: "True only when the user explicitly requests a monthly transaction; otherwise false or omitted." }, payment_day: { type: "integer", minimum: 1, maximum: 31 } }, required: ["type", "amount", "category"], additionalProperties: false } } },
];

type Draft = { type: "income" | "expense"; amount: number; category: string; date: string; note: string; repeat_monthly: boolean; payment_day?: number };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function cors(req: Request) {
  return { "Access-Control-Allow-Origin": req.headers.get("origin") === allowedOrigin ? allowedOrigin : "null", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
}
function response(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
function monthRange(month: string) { const [year, number] = month.split("-").map(Number); return { start: `${month}-01`, end: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) }; }
function safeMonth(month: unknown) { return typeof month === "string" && monthPattern.test(month) ? month : null; }
function publishableKey() {
  const direct = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (direct) return direct;
  try { return Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"))[0] as string; } catch { return ""; }
}
function safeDraft(value: Record<string, unknown>): Draft | null {
  const type = value.type === "income" || value.type === "expense" ? value.type : null;
  const amount = typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= .01 && value.amount <= 1_000_000 ? Math.round(value.amount * 100) / 100 : null;
  const category = typeof value.category === "string" && type ? categories[type].find((item) => item.toLowerCase() === value.category.toLowerCase()) || null : null;
  const date = typeof value.date === "string" && datePattern.test(value.date) ? value.date : new Date().toISOString().slice(0, 10);
  const repeat_monthly = value.repeat_monthly === true;
  const payment_day = typeof value.payment_day === "number" && Number.isInteger(value.payment_day) && value.payment_day >= 1 && value.payment_day <= 31 ? value.payment_day : undefined;
  if (!type || !amount || !category || !date) return null;
  return { type, amount, category, date, note: typeof value.note === "string" ? value.note.slice(0, 60) : "", repeat_monthly, ...(repeat_monthly ? { payment_day: payment_day || Number(date.slice(-2)) } : {}) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return response(req, { error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== allowedOrigin) return response(req, { error: "This origin is not allowed." }, 403);

  try {
    const authorization = req.headers.get("authorization");
    if (!authorization) return response(req, { error: "Please sign in before using Misu." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = publishableKey();
    if (!supabaseKey) return response(req, { error: "The Supabase publishable key is unavailable to Misu." }, 500);
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return response(req, { error: "Please sign in before using Misu." }, 401);

    const body = await req.json();
    const ledgerId = typeof body.ledger_id === "string" ? body.ledger_id : "";
    const messages = Array.isArray(body.messages) ? body.messages.slice(-8).filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map((item) => ({ role: item.role, content: item.content.slice(0, 1200) })) : [];
    if (!ledgerId || !messages.length) return response(req, { error: "Please send a message and money space." }, 400);
    const { data: ledger, error: ledgerError } = await supabase.from("ledgers").select("id,name").eq("id", ledgerId).single();
    if (ledgerError || !ledger) return response(req, { error: "That money space is unavailable." }, 404);

    let draft: Draft | null = null;
    const executeTool = async (name: string, input: Record<string, unknown>) => {
      const month = safeMonth(input.month);
      if (name === "draft_transaction") {
        const checked = safeDraft(input);
        if (!checked) return { error: "The draft needs a valid type, amount, category, and date. Ask the user for the missing detail." };
        draft = checked;
        return { status: "draft_ready", draft: checked };
      }
      if (!month) return { error: "Use a month in YYYY-MM format." };
      const { start, end } = monthRange(month);
      const { data, error } = await supabase.from("transactions").select("type,amount,category,note,transaction_date").eq("ledger_id", ledgerId).gte("transaction_date", start).lt("transaction_date", end).order("transaction_date", { ascending: false });
      if (error) return { error: "Could not retrieve transactions." };
      const rows = data || [];
      if (name === "get_month_summary") {
        const income = rows.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
        const spent = rows.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
        return { month, income, spent, left_to_spend: income - spent, entries: rows.length };
      }
      if (name === "get_spending_breakdown") {
        const breakdown: Record<string, number> = {};
        rows.filter((item) => item.type === "expense").forEach((item) => breakdown[item.category] = (breakdown[item.category] || 0) + Number(item.amount));
        return { month, categories: Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })) };
      }
      const query = typeof input.query === "string" ? input.query.toLowerCase().trim() : "";
      const type = input.type === "income" || input.type === "expense" ? input.type : null;
      return { month, transactions: rows.filter((item) => (!type || item.type === type) && (!query || `${item.category} ${item.note || ""}`.toLowerCase().includes(query))).slice(0, 20) };
    };

    const system = `You are Misu, a calm and concise personal-finance assistant for the money space “${ledger.name}”. Today's date is ${new Date().toISOString().slice(0, 10)}. You only know information returned by tools; never invent amounts or transactions. Use UK pounds and plain language without Markdown formatting. Use a read tool for every factual money question. When asked to add a transaction, ask only for a missing amount, type, or category, then call draft_transaction. Default to today and a one-off transaction unless the user explicitly requests monthly repetition. Never claim a draft is saved; tell the user it is ready to review and confirm. Do not offer financial, tax, credit, or investment advice.`;
    const groqMessages: Array<Record<string, unknown>> = [{ role: "system", content: system }, ...messages];
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) return response(req, { error: "Misu is not configured yet. Add GROQ_API_KEY to this project’s Edge Function secrets." }, 503);
    let finalReply = "";
    for (let step = 0; step < 4; step++) {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("MISU_MODEL") || "openai/gpt-oss-20b", temperature: 0.2, messages: groqMessages, tools, tool_choice: "auto" }) });
      if (!groqResponse.ok) throw new Error(`Misu could not reach its model (${groqResponse.status}).`);
      const completion = await groqResponse.json();
      const message = completion.choices?.[0]?.message;
      if (!message) throw new Error("Misu received an incomplete model response.");
      if (!message.tool_calls?.length) { finalReply = typeof message.content === "string" ? message.content : "I’m sorry, I couldn’t form a response."; break; }
      groqMessages.push({ role: "assistant", content: message.content || null, tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        let result: unknown;
        try { result = await executeTool(call.function.name, JSON.parse(call.function.arguments || "{}")); } catch { result = { error: "That tool request was invalid." }; }
        groqMessages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) });
      }
    }
    return response(req, { reply: finalReply || (draft ? "I’ve prepared that transaction for you to review." : "I’m sorry, I couldn’t complete that request."), draft });
  } catch (error) {
    return response(req, { error: error instanceof Error ? error.message : "Misu could not complete that request." }, 500);
  }
});
