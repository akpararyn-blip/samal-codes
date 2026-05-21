import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/i18n/LanguageProvider";
import { AuthFlow } from "@/components/auth/AuthFlow";
import { useAuth } from "@/components/auth/AuthProvider";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t } = useLanguage();
  const { user } = useAuth();

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-10"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="container mx-auto grid gap-12 px-4 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t.landing.title}
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">{t.landing.subtitle}</p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { t: t.landing.steps.s1Title, b: t.landing.steps.s1Body },
                { t: t.landing.steps.s2Title, b: t.landing.steps.s2Body },
                { t: t.landing.steps.s3Title, b: t.landing.steps.s3Body },
              ].map((s, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <h3 className="font-display text-base font-semibold">{s.t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.b}</p>
                </div>
              ))}
            </div>

            {user ? (
              <div className="mt-8">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
                >
                  {t.nav.dashboard} →
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex items-start justify-center lg:justify-end">
            <div className="w-full max-w-md">{!user ? <AuthFlow /> : null}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
