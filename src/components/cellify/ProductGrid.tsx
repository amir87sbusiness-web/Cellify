/**
 * ============================================================================
 * FILE: src/components/cellify/ProductGrid.tsx
 * EN: Renders the catalog with safe price handling.
 * ============================================================================
 */
import type { Product } from "@/lib/products";
import { CONFIG } from "@/config";

export function ProductGrid({ products, onSelect }: { products: Product[]; onSelect: (p: Product) => void }) {
  if (!products.length) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground">
        No items yet. Add products from the admin panel.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border">
      {products.map((p) => {
        const cover = p.media?.[0];
        
        // ایمن‌سازی: اگر قیمت تعریف نشده بود، آن را 0 در نظر بگیر
        const price = p.price_stars ?? 0;
        const dollarPrice = (price * CONFIG.BRAND.starToDollarRate).toFixed(2);

        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="group bg-background text-left p-6 transition-colors hover:bg-secondary"
          >
            <div className="aspect-[4/5] w-full overflow-hidden bg-muted">
              {cover?.type === "image" && cover.url ? (
                <img
                  src={cover.url}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover grayscale transition-transform duration-700 group-hover:scale-[1.03]"
                />
              ) : cover?.type === "video" && cover.url ? (
                <video src={cover.url} muted loop playsInline className="h-full w-full object-cover grayscale" />
              ) : (
                <div className="flex h-full items-center justify-center font-display text-5xl text-muted-foreground">C</div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-xl leading-tight">{p.name}</h3>
                <span className="text-sm font-medium whitespace-nowrap">
                  {price} {CONFIG.BRAND.currencyLabel}
                </span>
              </div>
              
              {/* قیمت تقریبی دلاری با استایل مینیمال */}
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground opacity-70">
                ≈ ${dollarPrice} USD
              </div>
            </div>

            {p.description && (
              <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{p.description}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}