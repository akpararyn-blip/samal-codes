import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function verifyRecaptcha(token: string): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // no key configured, allow
  if (!token) return false;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    });
    const data = (await res.json()) as { success: boolean; score?: number };
    return data.success && (data.score ?? 1) >= 0.3;
  } catch {
    return false;
  }
}

const phoneSchema = z
  .string()
  .min(10)
  .max(20)
  .regex(/^\+?[0-9]+$/, "Invalid phone");

export const getRecaptchaSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  return { siteKey: process.env.RECAPTCHA_SITE_KEY ?? "" };
});

export const checkPhoneExists = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: phoneSchema,
        recaptchaToken: z.string().optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ok = await verifyRecaptcha(data.recaptchaToken);
    if (!ok) return { ok: false as const, error: "recaptcha" as const };

    // listUsers paginates; search by phone via filter
    let page = 1;
    while (page < 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) return { ok: false as const, error: "server" as const };
      const found = list.users.find((u) => u.phone === data.phone);
      if (found) return { ok: true as const, exists: true };
      if (list.users.length < 200) break;
      page++;
    }
    return { ok: true as const, exists: false };
  });

function genOtp() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const b of bytes) out += String(b % 10);
  return out;
}

export const sendMockOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data }) => {
    const code = genOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("otp_codes")
      .upsert({ phone: data.phone, code, expires_at: expiresAt });
    if (error) return { ok: false as const, error: error.message };
    // Dev-only: surface the code so testing works without an SMS provider.
    return { ok: true as const, expiresAt, devCode: code };
  });

async function consumeOtp(phone: string, code: string) {
  const { data, error } = await supabaseAdmin
    .from("otp_codes")
    .select("code, expires_at")
    .eq("phone", phone)
    .maybeSingle();
  if (error || !data) return false;
  if (data.code !== code) return false;
  if (new Date(data.expires_at).getTime() < Date.now()) return false;
  await supabaseAdmin.from("otp_codes").delete().eq("phone", phone);
  return true;
}

export const verifyOtpAndRegister = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: phoneSchema,
        code: z.string().length(6),
        password: z.string().min(6).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const valid = await consumeOtp(data.phone, data.code);
    if (!valid) return { ok: false as const, error: "otp" as const };
    const { error } = await supabaseAdmin.auth.admin.createUser({
      phone: data.phone,
      password: data.password,
      phone_confirm: true,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const verifyOtpAndResetPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: phoneSchema,
        code: z.string().length(6),
        newPassword: z.string().min(6).max(72),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const valid = await consumeOtp(data.phone, data.code);
    if (!valid) return { ok: false as const, error: "otp" as const };

    // Find user by phone
    let userId: string | null = null;
    let page = 1;
    while (page < 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) return { ok: false as const, error: error.message };
      const found = list.users.find((u) => u.phone === data.phone);
      if (found) {
        userId = found.id;
        break;
      }
      if (list.users.length < 200) break;
      page++;
    }
    if (!userId) return { ok: false as const, error: "no_user" as const };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
