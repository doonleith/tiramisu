# Tiramisu

> Personal finance, without the noise.

Tiramisu is a lightweight, manual personal-finance tracker. It is a static web app backed by Supabase for Google sign-in and private per-user data.

## What it does

- Record income and expenses manually.
- Keep money in separate named spaces, such as Personal, Household, or Holiday.
- View income, spending, remaining money, category totals, and activity for a selected month.
- Create monthly recurring entries by selecting a payment day, such as the 1st of the month.
- Keep recurring entries private to the selected money space.
- Share a money space through a one-time invite link.
- Sign in with Google through Supabase Auth.

## Live app

The production site is published through GitHub Pages:

<https://doonleith.github.io/tiramisu/>

## Architecture

| Area | Implementation |
| --- | --- |
| Client | Static HTML, CSS, and browser JavaScript |
| Authentication | Google OAuth through Supabase Auth |
| Data | Supabase Postgres with row-level security (RLS) |
| Hosting | GitHub Pages from the repository’s default branch |
| PWA shell | `manifest.webmanifest`; the current service worker deliberately unregisters itself to avoid stale cached versions |

Internal technical documentation is maintained separately from this public repository.

## Repository layout

```text
index.html                     App structure and dialogs
app.js                         UI state, Supabase operations, period logic
styles.css                     Base visual system
overrides.css                  Product-specific refinements and responsive rules
assets/                        App icons, Google sign-in artwork, category icon sprite
supabase/schema.sql            Initial transactions table and RLS policies
supabase/recurring-payments.sql
                               Monthly recurring-payment migration
supabase/named-tabs.sql        Named money-space migration and ledger-aware RLS
supabase/shared-spaces.sql     Membership, invite links, and shared-space RLS
supabase/config.example.js     Safe configuration template
```

## Set up a new environment

### 1. Create a Supabase project

Create a project in the [Supabase dashboard](https://supabase.com/dashboard).

### 2. Run the database migrations in order

In Supabase **SQL Editor**, run each file once, in this order:

1. `supabase/schema.sql`
2. `supabase/recurring-payments.sql`
3. `supabase/named-tabs.sql`
4. `supabase/shared-spaces.sql`

The migrations preserve existing data, create named money spaces, and then add
shared-space membership and one-time invite links.

### 3. Configure the browser client

Copy `supabase/config.example.js` to `supabase/config.js`, then fill in the project URL and the **publishable / anon key** from Supabase’s API settings.

```js
window.CLEAR_SUPABASE_URL='https://YOUR-PROJECT.supabase.co';
window.CLEAR_SUPABASE_ANON_KEY='YOUR-PUBLISHABLE-ANON-KEY';
```

Never place a Supabase service-role key in this project. The publishable key is intended for browser use; RLS is what protects user data.

### 4. Configure Google sign-in

1. In Google Cloud, create a Web OAuth client.
2. Add this Supabase callback URL to its authorised redirect URIs:

   ```text
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

3. In Supabase **Authentication → Providers → Google**, enable Google and enter the Google client ID and client secret.
4. In Supabase **Authentication → URL Configuration**, add each deployed app URL as a redirect URL. For GitHub Pages this is normally:

   ```text
   https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/
   ```

## Development

There is no build step or package manager. Open `index.html` from a local static server or publish the static files to GitHub Pages.

When changing `app.js` or `overrides.css`, update the version query string in `index.html` so browsers receive the latest file, for example:

```html
<script src="app.js?v=30"></script>
```

## Deployment

GitHub Pages deploys changes from the repository’s default branch. Check deployment status in GitHub under **Deployments → github-pages**.

## Security notes

- All data tables use RLS policies tied to `auth.uid()`.
- Transactions and recurring rules are available only to a space owner or member.
- Only a space owner can create invite links or remove members.
- Invite links expire after seven days and can be accepted once.
- The app does not collect bank credentials or connect to bank accounts; all entries are manual.
- Avoid committing OAuth client secrets, Supabase service-role keys, or user-exported financial data.

## Current product boundaries

- The app is designed for manual personal finance tracking.
- Shared spaces use one-time links; Tiramisu does not send invitation emails.
- Recurring payments are generated for the month the user is viewing and remain individually editable.
- Categories are currently fixed in `app.js`. Custom categories and budget limits are future work.
