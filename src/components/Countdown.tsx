import { useEffect, useState } from "react";

interface Props {
  expiresAt: string | number | null;
  format?: "mmss" | "hhmmss";
  onExpire?: () => void;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function Countdown({ expiresAt, format = "mmss", onExpire }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target =
    expiresAt == null
      ? 0
      : typeof expiresAt === "number"
        ? expiresAt
        : new Date(expiresAt).getTime();
  const diff = Math.max(0, Math.floor((target - now) / 1000));

  useEffect(() => {
    if (diff === 0 && expiresAt != null && onExpire) onExpire();
  }, [diff, expiresAt, onExpire]);

  if (!expiresAt) return <span>--:--</span>;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (format === "hhmmss") return <span>{`${pad(h)}:${pad(m)}:${pad(s)}`}</span>;
  return <span>{`${pad(m)}:${pad(s)}`}</span>;
}
