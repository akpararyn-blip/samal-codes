import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageProvider";
import { supabase } from "@/integrations/supabase/client";
import {
  checkPhoneExists,
  sendMockOtp,
  verifyOtpAndRegister,
  verifyOtpAndResetPassword,
  getRecaptchaSiteKey,
} from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Countdown } from "@/components/Countdown";

type Step = "phone" | "register" | "login" | "forgot";

const OTP_KEY = "mn-sml-otp-expiry";
const DEV = import.meta.env.DEV;

declare global {
  interface Window {
    grecaptcha?: { ready: (cb: () => void) => void; execute: (key: string, opts: { action: string }) => Promise<string> };
  }
}

async function loadRecaptcha(siteKey: string): Promise<string> {
  if (!siteKey) return "";
  if (!window.grecaptcha) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("recaptcha load failed"));
      document.head.appendChild(s);
    });
  }
  return new Promise<string>((resolve, reject) => {
    window.grecaptcha!.ready(() => {
      window
        .grecaptcha!.execute(siteKey, { action: "submit" })
        .then(resolve)
        .catch(reject);
    });
  });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("8") && digits.length === 11) return "+7" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 11) return "+" + digits;
  if (digits.length >= 10) return "+" + digits;
  return "";
}

export function AuthFlow() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [consent, setConsent] = useState(false);
  const [siteKey, setSiteKey] = useState("");

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkFn = useServerFn(checkPhoneExists);
  const sendFn = useServerFn(sendMockOtp);
  const registerFn = useServerFn(verifyOtpAndRegister);
  const resetFn = useServerFn(verifyOtpAndResetPassword);
  const keyFn = useServerFn(getRecaptchaSiteKey);

  useEffect(() => {
    keyFn().then((r) => setSiteKey(r.siteKey)).catch(() => {});
  }, [keyFn]);

  // Restore timer
  useEffect(() => {
    if (!phone) return;
    const raw = localStorage.getItem(`${OTP_KEY}:${phone}`);
    if (raw) {
      const expiry = Number(raw);
      if (expiry > Date.now()) setOtpExpiresAt(new Date(expiry).toISOString());
      else localStorage.removeItem(`${OTP_KEY}:${phone}`);
    }
  }, [phone]);

  const startOtp = async (targetPhone: string) => {
    const r = await sendFn({ data: { phone: targetPhone } });
    if (!r.ok) {
      toast.error(t.errors.network);
      return false;
    }
    setOtpExpiresAt(r.expiresAt);
    localStorage.setItem(`${OTP_KEY}:${targetPhone}`, String(new Date(r.expiresAt).getTime()));
    if (DEV && "devCode" in r && r.devCode) {
      toast.info(`${t.auth.devOtp}: ${r.devCode}`, { duration: 10000 });
    }
    return true;
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      toast.error(t.errors.consentRequired);
      return;
    }
    const normalized = normalizePhone(phoneInput);
    if (!normalized) {
      toast.error(t.errors.invalidPhone);
      return;
    }
    setBusy(true);
    try {
      let token = "";
      try {
        token = await loadRecaptcha(siteKey);
      } catch {
        // soft fail
      }
      const r = await checkFn({ data: { phone: normalized, recaptchaToken: token } });
      if (!r.ok) {
        toast.error(r.error === "recaptcha" ? t.errors.recaptchaFailed : t.errors.network);
        return;
      }
      setPhone(normalized);
      if (r.exists) {
        setStep("login");
      } else {
        const sent = await startOtp(normalized);
        if (sent) setStep("register");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t.errors.passwordTooShort);
      return;
    }
    if (password !== password2) {
      toast.error(t.errors.passwordsMismatch);
      return;
    }
    if (otp.length !== 6) {
      toast.error(t.errors.invalidOtp);
      return;
    }
    setBusy(true);
    try {
      const r = await registerFn({ data: { phone, code: otp, password } });
      if (!r.ok) {
        toast.error(r.error === "otp" ? t.errors.invalidOtp : t.errors.network);
        return;
      }
      localStorage.removeItem(`${OTP_KEY}:${phone}`);
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) {
        toast.error(t.errors.network);
        return;
      }
      navigate({ to: "/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) {
        toast.error(t.errors.invalidCredentials);
        return;
      }
      navigate({ to: "/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t.errors.passwordTooShort);
      return;
    }
    if (otp.length !== 6) {
      toast.error(t.errors.invalidOtp);
      return;
    }
    setBusy(true);
    try {
      const r = await resetFn({ data: { phone, code: otp, newPassword: password } });
      if (!r.ok) {
        toast.error(r.error === "otp" ? t.errors.invalidOtp : t.errors.network);
        return;
      }
      localStorage.removeItem(`${OTP_KEY}:${phone}`);
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) {
        toast.error(t.errors.network);
        return;
      }
      navigate({ to: "/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  const canResend = !otpExpiresAt || new Date(otpExpiresAt).getTime() < Date.now();

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
      {step === "phone" && (
        <form onSubmit={handlePhoneSubmit} className="space-y-4">
          <h2 className="font-display text-xl font-bold">{t.auth.phoneTitle}</h2>
          <div className="space-y-2">
            <Label htmlFor="phone">{t.auth.phoneLabel}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder={t.auth.phonePlaceholder}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              required
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span>
              {t.auth.consent}{" "}
              <a href="/privacy" target="_blank" className="text-primary underline">
                {t.auth.privacy}
              </a>{" "}
              {t.auth.and}{" "}
              <a href="/terms" target="_blank" className="text-primary underline">
                {t.auth.terms}
              </a>{" "}
              {t.auth.consentTail}
            </span>
          </label>
          <Button type="submit" disabled={busy} className="w-full">
            {t.auth.continue}
          </Button>
        </form>
      )}

      {step === "register" && (
        <form onSubmit={handleRegister} className="space-y-4">
          <h2 className="font-display text-xl font-bold">{t.auth.otpTitle}</h2>
          <p className="text-sm text-muted-foreground">{phone}</p>
          <div className="space-y-2">
            <Label>{t.auth.otpLabel}</Label>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder={t.auth.otpPlaceholder}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t.auth.passwordLabel}</Label>
            <Input
              type="password"
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t.auth.repeatPasswordLabel}</Label>
            <Input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            {canResend ? (
              <button
                type="button"
                onClick={() => startOtp(phone)}
                className="text-primary hover:underline"
              >
                {t.auth.resend}
              </button>
            ) : (
              <span className="text-muted-foreground">
                {t.auth.resendIn} <Countdown expiresAt={otpExpiresAt} />
              </span>
            )}
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="text-muted-foreground hover:text-foreground"
            >
              {t.auth.back}
            </button>
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {t.auth.register}
          </Button>
        </form>
      )}

      {step === "login" && (
        <form onSubmit={handleLogin} className="space-y-4">
          <h2 className="font-display text-xl font-bold">{t.auth.loginTitle}</h2>
          <p className="text-sm text-muted-foreground">{phone}</p>
          <div className="space-y-2">
            <Label>{t.auth.passwordLabel}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={async () => {
                const sent = await startOtp(phone);
                if (sent) {
                  setOtp("");
                  setPassword("");
                  setStep("forgot");
                }
              }}
              className="text-primary hover:underline"
            >
              {t.auth.forgotPassword}
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="text-muted-foreground hover:text-foreground"
            >
              {t.auth.back}
            </button>
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {t.auth.login}
          </Button>
        </form>
      )}

      {step === "forgot" && (
        <form onSubmit={handleForgot} className="space-y-4">
          <h2 className="font-display text-xl font-bold">{t.auth.forgotTitle}</h2>
          <p className="text-sm text-muted-foreground">{phone}</p>
          <div className="space-y-2">
            <Label>{t.auth.otpLabel}</Label>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder={t.auth.otpPlaceholder}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t.auth.newPasswordLabel}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            {canResend ? (
              <button
                type="button"
                onClick={() => startOtp(phone)}
                className="text-primary hover:underline"
              >
                {t.auth.resend}
              </button>
            ) : (
              <span className="text-muted-foreground">
                {t.auth.resendIn} <Countdown expiresAt={otpExpiresAt} />
              </span>
            )}
            <button
              type="button"
              onClick={() => setStep("login")}
              className="text-muted-foreground hover:text-foreground"
            >
              {t.auth.back}
            </button>
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {t.auth.resetPassword}
          </Button>
        </form>
      )}
    </div>
  );
}
