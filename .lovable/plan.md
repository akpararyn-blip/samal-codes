
# Meganet × Samal — Giveaway Web App

Responsive promo-code giveaway on TanStack Start + Lovable Cloud (Supabase). Brand: green `#159c33`, accent yellow `#faff00`, light theme.

## Tech & setup

- Enable Lovable Cloud.
- Tailwind tokens in `src/styles.css` (oklch): `--primary` green, `--accent` yellow, white bg.
- i18n: `LanguageContext` (RU default, KZ), `localStorage`. Dictionaries in `src/i18n/{ru,kz}.ts`, KZ fully translated.
- reCAPTCHA v3: secrets `RECAPTCHA_SITE_KEY` (also exposed to client via a tiny server fn `getRecaptchaSiteKey`) and `RECAPTCHA_SECRET_KEY` (server verification).
- Toasts via `sonner`.

## Database schema (migration)

### Tables

- `public.codes`
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `code_string text not null unique` — format `MN-SML-XXXXXX`
  - `created_at timestamptz not null default now()`
  - Index `(user_id, created_at desc)`
- `public.otp_codes` (for mocked OTP) — admin-only, RLS enabled with no policies.
  - `phone text pk`, `code text`, `expires_at timestamptz`, `created_at timestamptz default now()`

### RLS on `codes`

- Enabled.
- `select using (auth.uid() = user_id)`
- `insert with check (auth.uid() = user_id)`
- No update / delete policies.

### 24-hour rule enforced at DB level (Postgres trigger)

```sql
create or replace function public.enforce_codes_24h()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at timestamptz;
begin
  select max(created_at) into last_at
  from public.codes
  where user_id = new.user_id;

  if last_at is not null and now() < last_at + interval '24 hours' then
    raise exception 'CODE_COOLDOWN_ACTIVE'
      using errcode = 'P0001',
            hint = (extract(epoch from (last_at + interval '24 hours' - now())))::text;
  end if;

  return new;
end;
$$;

create trigger codes_enforce_24h
before insert on public.codes
for each row execute function public.enforce_codes_24h();
```

The trigger is the source of truth. UI/timer is a UX hint only.

## Auth strategy (mocked OTP)

Real Phone OTP not configured. Mocked via server fns:

- `checkPhoneExists({ phone, recaptchaToken })` — verifies reCAPTCHA, uses `supabaseAdmin.auth.admin.listUsers` to check phone. Returns `{ exists }`.
- `sendMockOtp({ phone })` — generates 6-digit code, upserts into `otp_codes` with 2-min expiry. Returns `{ expiresAt }` (and `devCode` only in non-prod for testing).
- `verifyOtpAndRegister({ phone, code, password })` — verifies OTP row, calls `supabaseAdmin.auth.admin.createUser({ phone, password, phone_confirm: true })`, deletes OTP. Client then `signInWithPassword`.
- `verifyOtpAndResetPassword({ phone, code, newPassword })` — verifies OTP, `supabaseAdmin.auth.admin.updateUserById`.
- Login: standard `supabase.auth.signInWithPassword({ phone, password })`.

Timer persistence: `expiresAt` (server-issued ISO) saved in `localStorage` keyed by phone — countdown survives refresh.

## Server-side promo code generation

`generatePromoCode()` — `createServerFn` with `requireSupabaseAuth`:

```ts
// src/lib/codes.functions.ts
export const generatePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const gen = () => {
      let s = "";
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      for (const b of bytes) s += charset[b % charset.length];
      return `MN-SML-${s}`;
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      const code_string = gen();
      const { data, error } = await supabase
        .from("codes")
        .insert({ user_id: userId, code_string })
        .select("id, code_string, created_at")
        .single();

      if (!error) return { ok: true as const, code: data };

      // Trigger cooldown — surface to UI
      if (error.message?.includes("CODE_COOLDOWN_ACTIVE")) {
        const secondsLeft = Number(error.hint ?? 0);
        return { ok: false as const, reason: "cooldown" as const, secondsLeft };
      }
      // Unique violation on code_string — retry
      if (error.code === "23505" && error.message?.includes("code_string")) continue;
      // Other unique violation or unknown — bail
      return { ok: false as const, reason: "error" as const, message: error.message };
    }
    return { ok: false as const, reason: "collision" as const };
  });
```

Notes:
- Insert respects RLS (user can only insert their own) AND the BEFORE INSERT trigger (24h gate).
- Random source is server-side `crypto.getRandomValues`.
- Server returns a discriminated result; client renders the matching toast.

## Routes (TanStack file-based)

- `src/routes/__root.tsx` — providers (QueryClient, Language, Auth), `<Toaster />`, Header + Footer + `<Outlet />`.
- `src/routes/index.tsx` — Landing + auth flow.
- `src/routes/_authenticated.tsx` — `beforeLoad` gate → redirect `/` if no session.
- `src/routes/_authenticated/dashboard.tsx` — Dashboard.
- `src/routes/privacy.tsx`, `src/routes/terms.tsx`.

## Page 1: Landing & Auth (`/`)

Hero (RU/KZ): title, subtitle, 3 step cards.

Auth card state machine `step`:
1. `phone` — masked phone input, consent checkbox with inline `/privacy` and `/terms` links, "Continue". Runs reCAPTCHA v3 → `checkPhoneExists`.
2. Branch:
   - New → `register`: `sendMockOtp` → OTP input + password + confirm + 2-min countdown + disabled "Resend SMS".
   - Existing → `login`: password + "Forgot password?".
   - `forgot`: OTP + new password (same timer).
3. Success → `navigate({ to: "/dashboard" })`.

Validation with `zod`, inline errors + `sonner` toasts.

## Page 2: Dashboard (`/dashboard`)

- Header strip: user's phone, logout.
- "Generate code" card:
  - Query latest user code (TanStack Query).
  - UI computes `nextAvailableAt = lastCode.created_at + 24h`. If `now < nextAvailableAt` → button disabled with `Доступно через HH:MM:SS` ticking every second.
  - Else enabled, label `Создать код`.
  - Click → `useServerFn(generatePromoCode)()`:
    - `ok` → toast success, invalidate queries.
    - `reason: "cooldown"` → toast, sync countdown using returned `secondsLeft`.
    - `reason: "collision" | "error"` → toast error.
- "My codes" list: newest first, `code | DD.MM.YYYY | HH:MM` via `Intl.DateTimeFormat` honoring current locale.

## Pages 3-4: `/privacy`, `/terms`

Static RU/KZ placeholder copy, shared shell, back link.

## Global components

`Header` (logo + lang switcher + auth button), `Footer`, `LanguageSwitcher`, `PhoneInput`, `OtpInput`, `CountdownTimer` (drives off `expiresAt` timestamp).

## Secrets to request

- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`

## Build order

1. Enable Lovable Cloud.
2. Migration: `codes`, `otp_codes`, RLS policies, `enforce_codes_24h` function + trigger.
3. Request reCAPTCHA secrets.
4. Tokens + i18n + Header/Footer.
5. Server fns: auth (`checkPhoneExists`, `sendMockOtp`, `verifyOtpAndRegister`, `verifyOtpAndResetPassword`), `verifyRecaptcha`, `generatePromoCode`, `getRecaptchaSiteKey`.
6. AuthContext + `_authenticated` guard.
7. Landing + multi-step auth UI.
8. Dashboard wired to `generatePromoCode` + codes list.
9. Privacy/Terms.
10. QA: refresh-resilient timers, RLS, trigger rejection path, i18n switch, mobile layout.

## Notes

- Mocked OTP swap-out path: replace `sendMockOtp` / `verifyOtp*` with `supabase.auth.signInWithOtp` + `verifyOtp` once an SMS provider is configured. No DB or UI changes needed.
- Trigger uses `security definer` so it always reads all rows for the user regardless of session role.
