# Tiramisu technical architecture

## System overview

Tiramisu is a client-rendered static app. The browser loads `index.html`, `styles.css`, `overrides.css`, and `app.js`; `app.js` talks directly to Supabase using the project’s public browser configuration.

```text
Browser
  ├─ GitHub Pages: HTML, CSS, JavaScript, SVG assets
  └─ Supabase
       ├─ Auth: Google OAuth session
       └─ Postgres: ledgers, transactions, recurring_transactions
            └─ RLS: signed-in user can only access owned data
```

## Client responsibilities

`app.js` owns all client state:

- Supabase session and Google OAuth callback handling.
- The active money space and selected month.
- Reading, creating, updating, and deleting transactions.
- Creating and selecting named money spaces.
- Creating a transaction occurrence for an active recurring rule in the selected month when it does not already exist.
- Computing dashboard totals and category breakdowns in the browser.

The app is intentionally framework-free. This keeps deployment simple, but the file is a central integration point and changes should be reviewed carefully.

## Data model

### `ledgers`

Represents a named money space. Earlier UI copy called these “tabs”; the product now presents them as spaces.

| Field | Notes |
| --- | --- |
| `id` | UUID primary key |
| `user_id` | Owner from `auth.users` |
| `name` | 1–40 character space name, unique per user |
| `created_at` | Creation timestamp |

### `transactions`

Each income or expense entry.

| Field | Notes |
| --- | --- |
| `user_id` | Owner |
| `ledger_id` | Required named money space |
| `type` | `income` or `expense` |
| `amount` | Positive numeric amount |
| `category` | Category label selected in the client |
| `transaction_date` | Date used by the period selector |
| `recurring_transaction_id` | Optional link to the recurring rule that generated it |

### `recurring_transactions`

Stores a monthly rule rather than a series of pre-created transactions.

| Field | Notes |
| --- | --- |
| `ledger_id` | Named money space where the rule belongs |
| `start_date` | Holds the payment day used for monthly recurrence |
| `active` | Stopping a recurring payment marks the rule inactive |

The partial unique index on `(recurring_transaction_id, transaction_date)` prevents duplicate occurrences for the same monthly rule and date.

## Recurring payment flow

1. A new transaction defaults to **Repeat monthly**.
2. The user selects a payment day, not a calendar month.
3. The app saves a `recurring_transactions` rule and its first `transactions` occurrence.
4. Whenever the user opens a month, the app checks active rules for the selected space.
5. Missing occurrences for that month are inserted once, protected by the unique index.
6. Deleting a recurring occurrence stops the underlying rule and deletes that occurrence.

This is an on-demand materialisation approach. It avoids background jobs while ensuring a monthly occurrence is available when its period is viewed.

## Authentication flow

1. The landing page starts Supabase’s Google OAuth flow.
2. Google redirects back through Supabase Auth to the app URL.
3. `app.js` reads the callback tokens from the URL hash, stores the Supabase session, and clears the URL fragment.
4. The dashboard loads only for an authenticated session.

The Google button uses Google’s supplied SVG artwork. Do not redraw the Google mark or change its brand treatment without checking Google’s current branding guidance.

## Category icon system

`assets/tiramisu-category-icons.svg` is an SVG symbol sprite. The client maps expense categories to symbol IDs such as `rent-mortgage`, `gas-electric`, and `savings`.

Icons are used in:

- The category selector’s selected-value preview.
- Spending breakdown rows.
- Transaction rows.
- The landing page illustration.

Each is displayed in a 40px pastel rounded tile. Labels remain visible beside icons so category meaning does not depend on colour or imagery alone.

## Period selection

The dashboard month selector changes the client’s selected period. It applies to:

- Income and spending totals.
- Left to spend and its supporting insight.
- Category breakdown.
- Transactions shown in activity.
- Recurring occurrence materialisation.

Recurring activity shows the payment day (for example, `Monthly · 1st`) rather than a repeated month name.

## Security model

Supabase RLS is the security boundary. The migrations define policies that:

- Limit rows to the current authenticated user.
- Require a transaction or recurring rule to reference a money space owned by that user.
- Prevent a client from writing an entry into another user’s money space.

The browser can contain only the public Supabase URL and publishable/anon key. A service-role key would bypass RLS and must never be exposed in the client.

## Operating and changing the app

### Adding a migration

1. Create a new SQL file in `supabase/`.
2. Make it safe to run once and document ordering requirements.
3. Run it in Supabase SQL Editor before deploying client code that depends on it.
4. Add the migration to the setup sequence in `README.md` if it is required for fresh environments.

### Updating client assets

The app is static and can be aggressively cached. After changing `app.js` or `overrides.css`, increment the corresponding `?v=` value in `index.html`.

### GitHub Pages deployments

Each changed file on the default branch can trigger a Pages build. When several files are pushed one after another, intermediate builds may be cancelled or marked failed; verify that the final build for the latest commit is `built`.
