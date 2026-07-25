# Clear

> Know where your money went this month in under 10 seconds.

Manual personal-finance tracking with income, expenses, category totals and money left to spend.

## Setup

1. Create a project in [Supabase](https://supabase.com/dashboard).
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Copy `supabase/config.example.js` to `supabase/config.js` and add the project URL and publishable/anon key. Never use a service-role key in the browser.
4. Enable Google in Supabase Authentication → Providers and supply your Google OAuth client ID and secret.
5. Add `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` to the Google OAuth client redirect URIs, then add your app URL to Supabase Authentication → URL Configuration.

`supabase/config.js` is deliberately excluded from Git.
