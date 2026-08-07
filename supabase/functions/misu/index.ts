import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://doonleith.github.io";
const categories = {
  income: ["Salary", "Freelance", "Benefits", "Interest", "Other"],
  expense: ["Rent", "Mortgage", "Council tax", "Gas & electric", "Water", "Internet & mobile", "Insurance", "Debt payments", "Savings", "Disposable Income", "Subscriptions", "Groceries", "Transport", "Health", "Other"],
};

const tools = [
  { type: "function", function: { name: "get_month_summary", description: "Get total income, spending, and left to spend for a month in the active money space.", parameters: { type: "object", properties: { month: { type: "string", description: "Month in YYYY-MM format." } }, required: ["month"], additionalProperties: false } } },
  { type: "function", function: { name: "get_spending_breakdown", description: "Get expense category totals for a month in the active money space.", parameters: { type: "object", properties: { month: { type: "string", description: "Month in YYYY-MM format." } }, required: ["month"], additionalProperties: false } } },
  { type: "function", function: { name: "find_transactions", description: "Find and total recorded transactions in the active money space over a month or date range. Use date ranges for questions such as last 12 months, this year, annual spending, averages, or a specific merchant.", parameters: { type: "object", properties: { month: { type: "string", description: "A single month in YYYY-MM format. Do not combine with start_date or end_date." }, start_date: { type: "string", description: "Inclusive start date in YYYY-MM-DD format." }, end_date: { type: "string", description: "Inclusive end date in YYYY-MM-DD format." }, query: { type: "string", description: "A word or short phrase to match case-insensitively against transaction notes and categories." }, type: { type: "string", enum: ["income", "expense"] } }, additionalProperties: false } } },
  { type: "function", function: { name: "draft_transaction_updates", description: "Prepare changes to one or more existing transactions, but never save them. Always call find_transactions first, use only the returned transaction IDs, and ask a concise follow-up if the requested records are ambiguous. Use this for requests to change an amount, date, category, note, income/expense type, or to correct an existing entry.", parameters: { type: "object", properties: { updates: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", properties: { id: { type: "string", description: "Transaction ID returned by find_transactions." }, amount: { type: "number", minimum: 0.01, maximum: 1000000 } }, required: ["id", "amount"], additionalProperties: false } } }, required: ["updates"], additionalProperties: false } } },
  { type: "function", function: { name: "get_recurring_payments", description: "Find active monthly recurring payments and calculate their deterministic monthly and annual projections. Use this when the user asks what a subscription or repeating payment costs per year.", parameters: { type: "object", properties: { query: { type: "string", description: "A word or short phrase to match case-insensitively against recurring-payment notes and categories." }, type: { type: "string", enum: ["income", "expense"] } }, additionalProperties: false } } },
  { type: "function", function: { name: "analyse_savings_goal", description: "Calculate multi-month saving plans for a target and compare them with average recorded monthly headroom. Use this for questions about how much to save per month, how long a target may take, or how a target compares with recorded cash flow.", parameters: { type: "object", properties: { target: { type: "number", minimum: 0.01, maximum: 1000000 }, deadline_months: { type: "integer", minimum: 1, maximum: 120, description: "Include only when the user explicitly states a deadline in months. Never infer or choose a deadline." }, lookback_months: { type: "integer", minimum: 1, maximum: 24, description: "Months of recorded transactions to average. Default to 6." } }, required: ["target"], additionalProperties: false } } },
  { type: "function", function: { name: "draft_transaction", description: "Prepare, but never save, a transaction after the user asks to add one. Ask a concise follow-up only when the amount, type, or category is missing. Default to today and a one-off transaction unless the user says otherwise.", parameters: { type: "object", properties: { type: { type: "string", enum: ["income", "expense"] }, amount: { type: "number", minimum: 0.01 }, category: { type: "string" }, date: { type: "string", description: "Date in YYYY-MM-DD format. Omit to use today." }, note: { type: "string" }, repeat_monthly: { type: "boolean", description: "True only when the user explicitly requests a monthly transaction; otherwise false or omitted." }, payment_day: { type: "integer", minimum: 1, maximum: 31 } }, required: ["type", "amount", "category"], additionalProperties: false } } },
];

type Draft = { type: "income" | "expense"; amount: number; category: string; date: string; note: string; repeat_monthly: boolean; payment_day?: number };
type UpdateDraft = { updates: Array<{ id: string; type: "income" | "expense"; category: string; note: string; date: string; old_amount: number; new_amount: number; recurring_transaction_id: string | null; created_by_name: string }> };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function cors(req: Request) {
  return { "Access-Control-Allow-Origin": req.headers.get("origin") === allowedOrigin ? allowedOrigin : "null", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
}
function response(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
function monthRange(month: string) { const [year, number] = month.split("-").map(Number); return { start: `${month}-01`, end: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10) }; }
function safeMonth(month: unknown) { return typeof month === "string" && monthPattern.test(month) ? month : null; }
function safeDate(date: unknown) { return typeof date === "string" && datePattern.test(date) ? date : null; }
function addDay(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
function subtractDay(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }
function rounded(value: number) { return Math.round(value * 100) / 100; }
const advicePattern = /\b(?:you should|you must|you ought to|you need to|i recommend|my recommendation|i advise|you can afford|you could afford|you cannot afford|you can't afford|a good investment|a bad investment|safe investment|best investment|you (?:should|could|ought to|need to) (?:buy|sell|borrow|invest|take out|apply for))\b/i;
function insightOnly(reply: string) {
  const plainReply = reply.replace(/\*\*/g, "").replace(/(^|\n)\s*[*-]\s+/g, "$1");
  if (!advicePattern.test(plainReply)) return plainReply;
  return "I can’t make financial decisions or recommendations for you. I can show your recorded figures, calculate the maths, or compare neutral scenarios instead.";
}
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
    let updateDraft: UpdateDraft | null = null;
    const executeTool = async (name: string, input: Record<string, unknown>) => {
      if (name === "draft_transaction") {
        const checked = safeDraft(input);
        if (!checked) return { error: "The draft needs a valid type, amount, category, and date. Ask the user for the missing detail." };
        draft = checked;
        return { status: "draft_ready", draft: checked };
      }
      if (name === "draft_transaction_updates") {
        const requested = Array.isArray(input.updates) ? input.updates : [];
        const updates = requested.map((item) => ({
          id: typeof item?.id === "string" ? item.id : "",
          amount: typeof item?.amount === "number" && Number.isFinite(item.amount) ? Math.round(item.amount * 100) / 100 : 0,
        }));
        if (!updates.length || updates.length > 10 || updates.some((item) => !item.id || item.amount < .01 || item.amount > 1_000_000) || new Set(updates.map((item) => item.id)).size !== updates.length) {
          return { error: "Provide one to ten distinct transaction IDs returned by find_transactions, each with a valid replacement amount." };
        }
        const { data, error } = await supabase.from("transactions").select("id,type,amount,category,note,transaction_date,recurring_transaction_id,created_by_name").eq("ledger_id", ledgerId).in("id", updates.map((item) => item.id));
        if (error) return { error: "Could not retrieve the transactions to update." };
        if (!data || data.length !== updates.length) return { error: "One or more selected transactions are no longer available in this money space." };
        const byId = new Map(data.map((item) => [item.id, item]));
        updateDraft = {
          updates: updates.map((item) => {
            const original = byId.get(item.id)!;
            return { id: original.id, type: original.type, category: original.category, note: original.note || "", date: original.transaction_date, old_amount: Number(original.amount), new_amount: item.amount, recurring_transaction_id: original.recurring_transaction_id, created_by_name: original.created_by_name || "" };
          }),
        };
        return { status: "update_draft_ready", update_draft: updateDraft };
      }
      const query = typeof input.query === "string" ? input.query.toLowerCase().trim() : "";
      const type = input.type === "income" || input.type === "expense" ? input.type : null;
      if (name === "get_recurring_payments") {
        const { data, error } = await supabase.from("recurring_transactions").select("type,amount,category,note,start_date").eq("ledger_id", ledgerId).eq("active", true);
        if (error) return { error: "Could not retrieve recurring payments." };
        const payments = (data || []).filter((item) => (!type || item.type === type) && (!query || `${item.category} ${item.note || ""}`.toLowerCase().includes(query))).map((item) => ({
          type: item.type,
          category: item.category,
          note: item.note || "",
          start_date: item.start_date,
          monthly_amount: Number(item.amount),
          annual_projection: rounded(Number(item.amount) * 12),
        }));
        return {
          basis: "active monthly recurring payments",
          payments,
          count: payments.length,
          monthly_total: rounded(payments.reduce((sum, item) => sum + item.monthly_amount, 0)),
          annual_projection: rounded(payments.reduce((sum, item) => sum + item.annual_projection, 0)),
        };
      }
      if (name === "analyse_savings_goal") {
        const target = typeof input.target === "number" && Number.isFinite(input.target) && input.target >= .01 && input.target <= 1_000_000 ? rounded(input.target) : null;
        if (!target) return { error: "Provide a valid savings target." };
        const deadlineMonths = typeof input.deadline_months === "number" && Number.isInteger(input.deadline_months) && input.deadline_months >= 1 && input.deadline_months <= 120 ? input.deadline_months : null;
        const lookbackMonths = typeof input.lookback_months === "number" && Number.isInteger(input.lookback_months) && input.lookback_months >= 1 && input.lookback_months <= 24 ? input.lookback_months : 6;
        const today = new Date();
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - lookbackMonths + 1, 1)).toISOString().slice(0, 10);
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
        const { data, error } = await supabase.from("transactions").select("type,amount,transaction_date").eq("ledger_id", ledgerId).gte("transaction_date", start).lt("transaction_date", end);
        if (error) return { error: "Could not retrieve transactions for the savings calculation." };
        const months: Record<string, { income: number; spent: number; entries: number }> = {};
        for (const item of data || []) {
          const key = item.transaction_date.slice(0, 7);
          months[key] ||= { income: 0, spent: 0, entries: 0 };
          if (item.type === "income") months[key].income += Number(item.amount);
          if (item.type === "expense") months[key].spent += Number(item.amount);
          months[key].entries++;
        }
        const recordedMonths = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({
          month,
          income: rounded(values.income),
          spent: rounded(values.spent),
          left_to_spend: rounded(values.income - values.spent),
          entries: values.entries,
        }));
        const averageLeft = recordedMonths.length ? rounded(recordedMonths.reduce((sum, item) => sum + item.left_to_spend, 0) / recordedMonths.length) : null;
        const planMonths = deadlineMonths ? [deadlineMonths] : [3, 6, 12];
        const plans = planMonths.map((months) => {
          const monthlyRequired = Math.ceil((target / months) * 100) / 100;
          return {
            months,
            monthly_required: monthlyRequired,
            within_average_recorded_headroom: averageLeft === null ? null : monthlyRequired <= averageLeft,
            average_headroom_after_saving: averageLeft === null ? null : rounded(averageLeft - monthlyRequired),
          };
        });
        return {
          basis: "recorded monthly income minus recorded monthly expenses",
          target,
          requested_lookback_months: lookbackMonths,
          recorded_months_used: recordedMonths.length,
          average_monthly_left_to_spend: averageLeft,
          months: recordedMonths,
          plans,
          caveat: recordedMonths.length < 3 ? "Fewer than three months of recorded data are available, so affordability is only a rough indication." : "Past recorded headroom may not predict future affordability.",
        };
      }
      const month = safeMonth(input.month);
      const requestedStart = safeDate(input.start_date);
      const requestedEnd = safeDate(input.end_date);
      if ((name === "get_month_summary" || name === "get_spending_breakdown") && !month) return { error: "Use a month in YYYY-MM format." };
      if (name === "find_transactions" && !month && (!requestedStart || !requestedEnd)) return { error: "Provide either one month, or both start_date and end_date. Explain this limitation clearly if the range cannot be determined." };
      if (requestedStart && requestedEnd && requestedStart > requestedEnd) return { error: "The start date must not be after the end date." };
      const range = month ? monthRange(month) : { start: requestedStart!, end: addDay(requestedEnd!) };
      const { start, end } = range;
      const { data, error } = await supabase.from("transactions").select("id,type,amount,category,note,transaction_date").eq("ledger_id", ledgerId).gte("transaction_date", start).lt("transaction_date", end).order("transaction_date", { ascending: false });
      if (error) return { error: "Could not retrieve transactions." };
      const rows = data || [];
      if (name === "get_month_summary") {
        const income = rows.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
        const spent = rows.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
        return { month, income: rounded(income), spent: rounded(spent), left_to_spend: rounded(income - spent), entries: rows.length };
      }
      if (name === "get_spending_breakdown") {
        const breakdown: Record<string, number> = {};
        rows.filter((item) => item.type === "expense").forEach((item) => breakdown[item.category] = (breakdown[item.category] || 0) + Number(item.amount));
        return { month, categories: Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })) };
      }
      const matches = rows.filter((item) => (!type || item.type === type) && (!query || `${item.category} ${item.note || ""}`.toLowerCase().includes(query)));
      return {
        basis: "recorded transactions",
        start_date: start,
        end_date: month ? subtractDay(end) : requestedEnd,
        query,
        count: matches.length,
        total_amount: rounded(matches.reduce((sum, item) => sum + Number(item.amount), 0)),
        transactions: matches.slice(0, 100),
        truncated: matches.length > 100,
      };
    };

    const system = `You are Misu, a calm and concise personal-finance insights and maths assistant for the money space “${ledger.name}”. Today's date is ${new Date().toISOString().slice(0, 10)}. Your scope is strictly limited to: factual summaries of tool-returned data, arithmetic, projections, and neutral mathematical scenario comparisons. You must never give financial, investment, tax, credit, pension, debt, insurance, or affordability advice; recommend or endorse an action, product, provider, allocation, or decision; or tell the user what they should, must, need to, can afford, or cannot afford. When asked for advice or a decision, say that you cannot make recommendations and offer to show the relevant figures or compare neutral scenarios. Say that an amount is “within” or “above recorded average monthly headroom”, never that the user can or cannot afford it. You only know information returned by tools; never invent amounts or transactions. Use UK pounds and plain language without Markdown formatting. Use a read tool for every factual money question. Resolve short follow-ups such as “last 12 months” from the preceding conversation rather than asking the user to repeat the merchant or topic. Convert relative periods into exact dates before calling find_transactions. For “last 12 months”, use the inclusive period from one year before tomorrow through today. Distinguish recorded totals from recurring-payment projections explicitly. When asked broadly how much a named merchant, subscription, or repeating payment costs “a year” or “annually”, call both find_transactions for the last 12 months and get_recurring_payments, then report both the recorded total and current annual projection when available. When asked only what was actually spent, call find_transactions. When asked only for a projection, call get_recurring_payments. For a savings goal, never assume the entire target must be saved in one month. Call analyse_savings_goal. Include deadline_months only when the user explicitly supplies a deadline; never choose or infer one. If no deadline is supplied, show concise 3-, 6-, and 12-month options and compare each neutrally with average recorded monthly headroom. If a deadline is supplied, calculate that plan. State how many months of data were used and include the tool’s caveat. Calculations returned by tools are authoritative. If a tool returns an error or no matching data, explain specifically what is unavailable instead of giving a generic failure. When asked to add a transaction, ask only for a missing amount, type, or category, then call draft_transaction. Default to today and a one-off transaction unless the user explicitly requests monthly repetition. When asked to edit an existing transaction, call find_transactions first. If the wording could match more than one transaction, ask a concise question rather than guess. Once the matching records and their IDs are clear, call draft_transaction_updates. Never expose transaction IDs or claim an edit has been saved: say the changes are ready to review and confirm.`;
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
    const reply = finalReply || (draft || updateDraft ? "I’ve prepared those changes for you to review." : "I’m sorry, I couldn’t complete that request.");
    return response(req, { reply: insightOnly(reply), draft, update_draft: updateDraft });
  } catch (error) {
    return response(req, { error: error instanceof Error ? error.message : "Misu could not complete that request." }, 500);
  }
});
