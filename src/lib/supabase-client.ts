/**
 * ============================================================================
 * FILE: src/lib/supabase-client.ts
 * ----------------------------------------------------------------------------
 * EN: Lazy Supabase client. Reads credentials from src/config.ts.
 *     Returns `null` if credentials are missing so the UI can render a
 *     graceful "not configured" state instead of crashing at boot.
 *
 * YOU CAN CHANGE:
 *   - The shape of the returned client options (auth persistence, etc.)
 *   Do NOT hardcode keys here — put them in src/config.ts only.
 *
 * FA:
 *   اتصال‌دهنده‌ی Supabase. کلیدها را از فایل config.ts می‌خواند. اگر کلیدها
 *   وارد نشده باشند، برنامه از کار نمی‌افتد و فقط پیام پیکربندی نشان می‌دهد.
 * ============================================================================
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFIG, isSupabaseConfigured } from "@/config";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (_client) return _client;
  _client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "cellify-auth",
    },
  });
  return _client;
}

/**
 * Recommended schema (run in the Supabase SQL editor):
 *
 *   create table public.products (
 *     id uuid primary key default gen_random_uuid(),
 *     name text not null,
 *     description text,
 *     price_stars integer not null default 0,
 *     media jsonb not null default '[]'::jsonb,  -- [{type:'image'|'video', url:''}]
 *     file_url text,                              -- digital file to deliver
 *     active boolean not null default true,
 *     created_at timestamptz not null default now()
 *   );
 *   alter table public.products enable row level security;
 *   create policy "public read" on public.products
 *     for select using (active = true);
 *
 *   create table public.orders (
 *     id uuid primary key default gen_random_uuid(),
 *     product_id uuid references public.products(id),
 *     telegram_user_id bigint not null,
 *     amount_stars integer not null,
 *     status text not null default 'pending',  -- pending|paid|delivered|failed
 *     payload text,
 *     created_at timestamptz not null default now()
 *   );
 *   alter table public.orders enable row level security;
 */
