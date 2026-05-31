/**
 * ============================================================================
 * FILE: src/lib/products.ts
 * ----------------------------------------------------------------------------
 * EN: Product data layer. Talks to Supabase if configured, otherwise returns
 *     a small in-memory demo catalog so the UI is never empty during setup.
 *
 * YOU CAN CHANGE:
 *   - The DEMO_PRODUCTS array (used only while Supabase keys are empty)
 *   - The table name "products" if you renamed it in your database
 *
 * FA:
 *   لایه‌ی داده‌ی محصولات. اگر کلیدهای Supabase وارد شده باشد، از دیتابیس
 *   می‌خواند؛ در غیر این صورت چند محصول نمونه نشان می‌دهد.
 * ============================================================================
 */
import { getSupabase } from "./supabase-client";

export interface ProductMedia { type: "image" | "video"; url: string }
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price_stars: number;
  media: ProductMedia[];
  file_url: string | null;
  active: boolean;
  created_at?: string;
}

const DEMO_PRODUCTS: Product[] = [
  {
    id: "demo-1",
    name: "Monolith — Wallpaper Set",
    description: "A 24-piece collection of monochrome wallpapers shot on medium format film.",
    price_stars: 50,
    media: [{ type: "image", url: "https://images.unsplash.com/photo-1517816743773-6e0fd518b4a6?q=80&w=1200&auto=format" }],
    file_url: null,
    active: true,
  },
  {
    id: "demo-2",
    name: "Noir — Lightroom Presets",
    description: "Twelve cinematic black & white presets for stills and portraits.",
    price_stars: 120,
    media: [{ type: "image", url: "https://images.unsplash.com/photo-1495707902641-75cac588d2e9?q=80&w=1200&auto=format" }],
    file_url: null,
    active: true,
  },
  {
    id: "demo-3",
    name: "Atelier — Notion Template",
    description: "A minimalist studio operating system for solo creators.",
    price_stars: 200,
    media: [{ type: "image", url: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?q=80&w=1200&auto=format" }],
    file_url: null,
    active: true,
  },
];

export async function listProducts(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return DEMO_PRODUCTS;
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error || !data) return DEMO_PRODUCTS;
  return data as Product[];
}

export async function listAllProducts(): Promise<Product[]> {
  const sb = getSupabase();
  if (!sb) return DEMO_PRODUCTS;
  const { data } = await sb.from("products").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Product[];
}

export async function upsertProduct(p: Partial<Product> & { name: string; price_stars: number }) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.from("products").upsert(p).select().single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
}
