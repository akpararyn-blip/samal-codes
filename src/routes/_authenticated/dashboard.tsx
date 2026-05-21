import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { generatePromoCode } from "@/lib/codes.functions";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/Countdown";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Личный кабинет — Meganet × Samal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

interface Code {
  id: string;
  code_string: string;
  created_at: string;
}

function Dashboard() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const genFn = useServerFn(generatePromoCode);
  const [busy, setBusy] = useState(false);

  const codesQuery = useQuery({
    queryKey: ["codes", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Code[]> => {
      const { data, error } = await supabase
        .from("codes")
        .select("id, code_string, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const latest = codesQuery.data?.[0];
  const nextAvailableAt = latest
    ? new Date(latest.created_at).getTime() + 24 * 60 * 60 * 1000
    : 0;
  const cooldownActive = nextAvailableAt > Date.now();

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const r = await genFn();
      if (r.ok) {
        toast.success(t.dashboard.generated);
        qc.invalidateQueries({ queryKey: ["codes"] });
      } else if (r.reason === "cooldown") {
        toast.error(t.dashboard.cooldown);
        qc.invalidateQueries({ queryKey: ["codes"] });
      } else {
        toast.error(t.dashboard.error);
      }
    } catch {
      toast.error(t.dashboard.error);
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString(locale === "ru" ? "ru-RU" : "kk-KZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return { date, time };
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{t.dashboard.yourPhone}</p>
        <p className="font-display text-2xl font-bold">{user?.phone}</p>
      </div>

      <div
        className="rounded-3xl border border-border p-8 shadow-lg"
        style={{ background: "var(--gradient-hero)" }}
      >
        <h2 className="font-display text-xl font-bold text-primary-foreground">
          {t.dashboard.generateTitle}
        </h2>
        <div className="mt-6">
          {cooldownActive ? (
            <Button
              disabled
              size="lg"
              className="w-full bg-white/20 text-primary-foreground hover:bg-white/20"
            >
              {t.dashboard.availableIn}{" "}
              <Countdown
                expiresAt={nextAvailableAt}
                format="hhmmss"
                onExpire={() => qc.invalidateQueries({ queryKey: ["codes"] })}
              />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={busy}
              size="lg"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-bold"
            >
              {t.dashboard.generate}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h3 className="font-display text-lg font-bold">{t.dashboard.myCodesTitle}</h3>
        <div className="mt-4 space-y-2">
          {codesQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          ) : codesQuery.data && codesQuery.data.length > 0 ? (
            codesQuery.data.map((c) => {
              const { date, time } = fmtDate(c.created_at);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                >
                  <span className="font-mono text-sm font-bold tracking-wider sm:text-base">
                    {c.code_string}
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-sm">
                    {date} · {time}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t.dashboard.empty}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
