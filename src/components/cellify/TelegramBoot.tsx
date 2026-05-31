/**
 * ============================================================================
 * FILE: src/components/cellify/TelegramBoot.tsx
 * EN: Mounts the Telegram WebApp SDK, syncs theme (dark/light) onto <html>.
 *     Safe to render even when not inside Telegram.
 * FA: راه‌اندازی SDK تلگرام و همگام‌سازی تم تاریک/روشن.
 * You can change: default theme fallback, expand() behavior.
 * ============================================================================
 */
import { useEffect } from "react";
import { loadTelegramSdk, tg, getTelegramTheme } from "@/lib/telegram";

export function TelegramBoot() {
  useEffect(() => {
    let cancelled = false;
    loadTelegramSdk().then(() => {
      if (cancelled) return;
      const app = tg();
      app?.ready();
      app?.expand();
      const apply = () => {
        const t = getTelegramTheme();
        document.documentElement.classList.toggle("dark", t === "dark");
      };
      apply();
      app?.onEvent("themeChanged", apply);
    });
    return () => { cancelled = true; };
  }, []);
  return null;
}
