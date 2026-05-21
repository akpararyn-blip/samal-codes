import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Условия использования — Meganet × Samal" },
      { name: "description", content: "Условия участия в розыгрыше Meganet × Samal." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { t } = useLanguage();
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="text-sm text-primary hover:underline">
        {t.legal.back}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{t.legal.termsTitle}</h1>
      <p className="mt-6 leading-relaxed text-muted-foreground">{t.legal.placeholder}</p>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
        incididunt ut labore et dolore magna aliqua.
      </p>
    </div>
  );
}
