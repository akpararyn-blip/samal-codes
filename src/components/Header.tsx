import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";

export function Header() {
  const { t, locale, setLocale } = useLanguage();
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
            M
          </div>
          <span className="font-display text-base font-bold tracking-tight">
            Meganet × Samal
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-border p-0.5 text-xs font-medium">
            <button
              onClick={() => setLocale("ru")}
              className={`rounded-full px-3 py-1 transition ${
                locale === "ru"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              RU
            </button>
            <button
              onClick={() => setLocale("kz")}
              className={`rounded-full px-3 py-1 transition ${
                locale === "kz"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              KZ
            </button>
          </div>

          {user ? (
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              {t.nav.logout}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
