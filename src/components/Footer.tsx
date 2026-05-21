import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/i18n/LanguageProvider";

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>{t.footer.copy}</p>
        <div className="flex gap-4">
          <Link to="/privacy" className="hover:text-foreground transition">
            {t.footer.privacy}
          </Link>
          <Link to="/terms" className="hover:text-foreground transition">
            {t.footer.terms}
          </Link>
        </div>
      </div>
    </footer>
  );
}
