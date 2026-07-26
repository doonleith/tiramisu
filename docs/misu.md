# Misu

Misu is Tiramisu’s in-app money assistant. It runs as a Supabase Edge Function and uses Groq’s API for the language model. The browser never receives the Groq key.

## What it can do

- Answer questions about the active money space, including monthly totals, spending breakdowns, and matching transactions.
- Search recorded transactions across a rolling date range, including “last 12 months” questions.
- Distinguish recorded spending from the projected annual cost of active monthly payments.
- Compare 3-, 6-, and 12-month savings-goal plans with average recorded monthly headroom.
- Prepare an income or expense transaction from a conversational request.
- Save nothing automatically: the user must select **Confirm & add** in the app.

Misu cannot access another user’s data or another money space. The Edge Function forwards the signed-in user’s JWT to Supabase, so existing Row Level Security policies still apply.

## First deployment

1. Create a Groq API key in the Groq console. Use the Free plan for early testing.
2. In Supabase, open the project, then **Edge Functions** > **Secrets**. Add a secret named `GROQ_API_KEY` and paste the value there. Do not put it in GitHub or the browser.
3. In Supabase, select **Edge Functions** > **Deploy a new function** > **Via Editor**. Name the function `Misu`.
4. Copy the contents of [`supabase/functions/misu/index.ts`](../supabase/functions/misu/index.ts) into the editor.
5. In the function’s settings, turn off the platform **Verify JWT** option. Misu verifies the signed-in user inside the function and uses that JWT for RLS-scoped database reads. This avoids compatibility issues with asymmetric Supabase signing keys.
6. Deploy the function. The **Ask Misu** button in the signed-in app will then work.

The default model is `openai/gpt-oss-20b`. You can optionally set a `MISU_MODEL` Edge Function secret to change it.

## Safety design

- The model only receives the selected money space and tool results needed to answer the question.
- Database reads use the caller’s authenticated Supabase client rather than a service-role key.
- A transaction draft is validated against Tiramisu’s category list, amount limits, and date format.
- Date-range totals and recurring annual projections are calculated by the Edge Function rather than by the language model.
- Savings-goal affordability is an indication based on recorded cash flow, and responses state how many months of data were available.
- Only the web app’s **Confirm & add** button writes to `transactions` or `recurring_transactions`.
- Misu is limited to factual insights, arithmetic, projections, and neutral scenario comparisons.
- Misu does not provide financial, investment, tax, credit, pension, debt, insurance, or affordability advice. A server-side response guard blocks common recommendation-style language even if the model produces it.

## Operational notes

- The function only accepts requests from `https://doonleith.github.io`.
- Keep Groq’s Free-plan limits in mind before inviting other people. Add a paid plan or request limits when usage grows.
- Do not add LangSmith tracing until you have reviewed its data retention settings, because prompts can include financial information.
