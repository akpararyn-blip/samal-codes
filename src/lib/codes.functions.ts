import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateCodeString(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (const b of bytes) s += CHARSET[b % CHARSET.length];
  return `MN-SML-${s}`;
}

export const generatePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code_string = generateCodeString();
      const { data, error } = await supabase
        .from("codes")
        .insert({ user_id: userId, code_string })
        .select("id, code_string, created_at")
        .single();

      if (!error && data) {
        return { ok: true as const, code: data };
      }

      const message = error?.message ?? "";
      // 24h cooldown trigger
      if (message.includes("CODE_COOLDOWN_ACTIVE")) {
        // Look up the actual remaining time from latest row
        const { data: last } = await supabase
          .from("codes")
          .select("created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let secondsLeft = 0;
        if (last) {
          const next = new Date(last.created_at).getTime() + 24 * 60 * 60 * 1000;
          secondsLeft = Math.max(0, Math.ceil((next - Date.now()) / 1000));
        }
        return { ok: false as const, reason: "cooldown" as const, secondsLeft };
      }
      // Unique violation on code_string -> retry
      if (error && (error.code === "23505" || message.includes("code_string"))) {
        continue;
      }
      return { ok: false as const, reason: "error" as const, message };
    }
    return { ok: false as const, reason: "collision" as const };
  });
