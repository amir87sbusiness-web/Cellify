/**
 * ============================================================================
 * FILE: src/components/cellify/BrandHeader.tsx
 * EN: Top brand header. Pure typographic logo, no images.
 * FA: هدر برند با تایپوگرافی خالص، بدون تصویر.
 * You can change: tagline text, link list.
 * ============================================================================
 */
import { CONFIG } from "@/config";

export function BrandHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center border border-foreground font-display text-xl">
            C
          </span>
          <span className="font-sans text-sm tracking-luxury">{CONFIG.BRAND.name}</span>
        </div>
        <span className="hidden sm:block text-xs uppercase tracking-luxury text-muted-foreground">
          Atelier
        </span>
      </div>
    </header>
  );
}
