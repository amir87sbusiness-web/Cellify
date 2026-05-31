/**
 * ============================================================================
 * FILE: src/routes/index.tsx
 * EN: Home / storefront. SPA — clicking a product opens a checkout sheet in
 *     the same view. No navigation, no reloads.
 * FA: صفحه‌ی اصلی فروشگاه. کلیک روی محصول، پنجره‌ی خرید را در همان صفحه باز
 *     می‌کند (بدون رفرش یا تب جدید).
 * You can change: hero copy, the layout, the number of grid columns.
 * ============================================================================
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CONFIG, isSupabaseConfigured } from "@/config";
import { BrandHeader } from "@/components/cellify/BrandHeader";
import { ProductGrid } from "@/components/cellify/ProductGrid";
import { CheckoutSheet } from "@/components/cellify/CheckoutSheet";
import { TelegramBoot } from "@/components/cellify/TelegramBoot";
import { listProducts, type Product } from "@/lib/products";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cellify — Digital goods, curated in monochrome" },
      { name: "description", content: "A luxury Telegram Mini App for digital goods, paid in Stars." },
    ],
  }),
  component: Index,
});

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProducts().then((p) => { setProducts(p); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TelegramBoot />
      <BrandHeader />

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 text-center">
        <p className="text-[10px] uppercase tracking-luxury text-muted-foreground">Maison Digitale</p>
        <h1 className="mt-6 font-display text-5xl sm:text-7xl leading-[0.95]">
          Quiet luxury,<br/>delivered in pixels.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-sm text-muted-foreground">
          {CONFIG.BRAND.tagline} Pay in Telegram Stars. Receive instantly in chat.
        </p>
      </section>

      {!isSupabaseConfigured() && (
        <div className="mx-auto max-w-5xl px-6 mb-8">
          <div className="border border-border p-4 text-xs text-muted-foreground">
            <span className="uppercase tracking-luxury text-foreground">Setup —</span>{" "}
            You're viewing demo products. Add your Supabase keys in{" "}
            <code className="font-mono">src/config.ts</code> to load real data.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-0 sm:px-6 pb-24">
        {loading ? (
          <div className="py-24 text-center text-sm text-muted-foreground">Loading collection…</div>
        ) : (
          <ProductGrid products={products} onSelect={setSelected} />
        )}
      </main>

      <footer className="border-t border-border py-10 text-center text-[10px] uppercase tracking-luxury text-muted-foreground">
        © {new Date().getFullYear()} {CONFIG.BRAND.name}
      </footer>

      <CheckoutSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
