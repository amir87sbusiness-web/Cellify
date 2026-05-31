export const CONFIG = {
  // فعلاً مقادیر را مستقیم بنویس تا بفهمیم مشکل از محیط است یا نه
  SUPABASE_URL: "https://vxorgnnszkoywcwschde.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4b3Jnbm5zemtveXdjd3NjaGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTczNTMsImV4cCI6MjA5NTM3MzM1M30.yPSpCyuhepxj_j1E91-NJPGGtNu36Qm_HqXCb5DwHnY",
  
  TELEGRAM_BOT_USERNAME: "Cellify_bot",

  BRAND: {
    name: "CELLIFY",
    tagline: "Digital goods. Curated in monochrome.",
    currencyLabel: "Stars",
    currencyCode: "XTR",
    starToDollarRate: 0.012,
  },
} as const;

export const isSupabaseConfigured = (): boolean =>
  Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const isTelegramConfigured = (): boolean =>
  Boolean(CONFIG.TELEGRAM_BOT_USERNAME);