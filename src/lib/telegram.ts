/**
 * ============================================================================
 * FILE: src/lib/telegram.ts
 * ----------------------------------------------------------------------------
 * EN: Lightweight wrapper around the Telegram WebApp SDK (window.Telegram).
 *     - Loads the SDK script on first use
 *     - Exposes helpers for theme, haptics, invoice / Stars payment
 *     - Falls back gracefully when running outside Telegram (regular browser)
 *
 * YOU CAN CHANGE:
 *   - The default theme fallback colors
 *   - The invoice payload format
 *
 * FA:
 *   پوشش‌دهنده‌ی SDK تلگرام. اگر برنامه داخل تلگرام باز شود از API آن استفاده
 *   می‌کند، در غیر این صورت در مرورگر عادی نیز بدون خطا اجرا می‌شود.
 * ============================================================================
 */

type Theme = "light" | "dark";

interface TGWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
  colorScheme: Theme;
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  HapticFeedback?: { impactOccurred: (style: string) => void; notificationOccurred: (t: string) => void };
  onEvent: (event: string, cb: (...args: unknown[]) => void) => void;
  offEvent: (event: string, cb: (...args: unknown[]) => void) => void;
  openInvoice?: (url: string, cb: (status: string) => void) => void;
  showAlert?: (msg: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TGWebApp };
  }
}

let scriptLoading: Promise<void> | null = null;

export function loadTelegramSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Telegram?.WebApp) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // fail soft
    document.head.appendChild(s);
  });
  return scriptLoading;
}

export function tg(): TGWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramTheme(): Theme {
  const app = tg();
  if (app?.colorScheme) return app.colorScheme;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function getTelegramUserId(): number | null {
  return tg()?.initDataUnsafe?.user?.id ?? null;
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  tg()?.HapticFeedback?.impactOccurred(style);
}

/**
 * Open a Telegram Stars invoice.
 * `invoiceUrl` should be produced by your backend / bot via
 * createInvoiceLink (currency = "XTR").
 */
export function openInvoice(invoiceUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const app = tg();
    if (!app?.openInvoice) {
      resolve("unsupported");
      return;
    }
    app.openInvoice(invoiceUrl, (status) => resolve(status));
  });
}
