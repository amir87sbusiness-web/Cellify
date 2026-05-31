/**
 * ============================================================================
 * FILE: src/config.ts
 * ----------------------------------------------------------------------------
 * WHAT THIS FILE DOES (English):
 * Central configuration file for the entire Cellify Mini App.
 * All credentials, API keys, tokens and identifiers used by the front-end
 * and by the Supabase / Telegram integrations are defined here.
 *
 * WHAT YOU CAN CHANGE:
 * - SUPABASE_URL          -> your Supabase project URL
 * - SUPABASE_ANON_KEY     -> your Supabase public anon key
 * - TELEGRAM_BOT_TOKEN    -> your Telegram bot token (used only by backend / bot)
 * - TELEGRAM_BOT_USERNAME -> your bot username (without @)
 * - ADMIN_EMAIL           -> the email allowed to log into /super-control-9xA3p
 * - BRAND                 -> brand name, tagline, currency label
 *
 * DO NOT change variable NAMES, only their VALUES. The rest of the app
 * imports from this file.
 *
 * ----------------------------------------------------------------------------
 * توضیحات فارسی:
 * این فایل، فایل پیکربندی مرکزی کل برنامه است.
 * تمام کلیدها، توکن‌ها و آدرس‌های اتصال به Supabase و تلگرام از طریق فایل env. 
 * تزریق می‌شوند.
 * ============================================================================
 */

export const CONFIG = {
  /** Supabase */
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "",          
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "",     

  /** Telegram */
  // امنیتی: توکن ربات نباید در سمت کاربر باندل شود. در Edge Functions مستقیما از Deno.env استفاده کنید.
  TELEGRAM_BOT_TOKEN: "",        
  TELEGRAM_BOT_USERNAME: import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "",     
  TELEGRAM_PROVIDER_TOKEN: "",   // leave empty when using Telegram Stars (XTR)

  /** Admin */
  ADMIN_EMAIL: import.meta.env.VITE_ADMIN_EMAIL || "",
  ADMIN_ROUTE: import.meta.env.VITE_ADMIN_ROUTE || "",

  /** Brand */
  BRAND: {
    name: "CELLIFY",
    tagline: "Digital goods. Curated in monochrome.",
    currencyLabel: "Stars",
    currencyCode: "XTR", // Telegram Stars
  },
} as const;

/**
 * Returns true when both Supabase credentials are present.
 * The app uses this to render a friendly "configure your keys" notice
 * instead of throwing runtime errors when the file is still empty.
 */
export const isSupabaseConfigured = (): boolean =>
  Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const isTelegramConfigured = (): boolean =>
  Boolean(CONFIG.TELEGRAM_BOT_USERNAME);