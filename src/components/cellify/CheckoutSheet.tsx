/**
 * ============================================================================
 * FILE: src/components/cellify/CheckoutSheet.tsx
 * EN: Bottom sheet that shows product detail + Telegram Stars checkout.
 * FA: پنل پایین صفحه برای مشاهده محصول و خرید با Telegram Stars.
 * ============================================================================
 */
import { useEffect, useState } from "react";
import type { Product } from "@/lib/products";
import { CONFIG } from "@/config";
import { getSupabase } from "@/lib/supabase-client";
import { openInvoice, haptic, getTelegramUserId } from "@/lib/telegram";

export function CheckoutSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (product) setStatus("");
  }, [product]);

  if (!product) return null;

  async function buy() {
    if (!product) return;
    setBusy(true);
    setStatus("");
    haptic("medium");
    
    try {
      const tgUserId = getTelegramUserId();
      
      // بررسی اینکه آیا کاربر واقعاً داخل تلگرام است
      if (!tgUserId) {
        setStatus("Please open this app inside Telegram to make a purchase.");
        setBusy(false);
        return;
      }

      const sb = getSupabase();
      let invoiceUrl: string | null = null;

      if (sb) {
        // صدا زدن تابع ساخت فاکتور در دیتابیس
        const { data, error } = await sb.rpc("create_stars_invoice", {
          p_product_id: product.id,
          p_telegram_user_id: tgUserId,
        });

        if (error) {
          console.error("Supabase RPC Error:", error);
          throw new Error("Failed to generate invoice.");
        }

        // هندل کردن خروجی دیتابیس (چه متن باشد چه آبجکت)
        invoiceUrl = typeof data === 'string' ? data : (data as any)?.invoice_url ?? null;
      }

      if (!invoiceUrl) {
        setStatus("System error: Could not retrieve the payment link.");
        return;
      }

      // باز کردن پاپ‌آپ رسمی تلگرام برای پرداخت ستاره
      const result = await openInvoice(invoiceUrl);
      
      if (result === "paid") {
        setStatus("Payment successful! The file has been sent to your Telegram chat.");
      } else if (result === "cancelled") {
        setStatus("Payment cancelled.");
      } else if (result === "failed") {
        setStatus("Payment failed. Please try again.");
      } else {
        setStatus("Action required in Telegram.");
      }
    } catch (e) {
      console.error("Checkout Error:", e);
      setStatus(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-card text-card-foreground border-t sm:border border-border max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="text-xs uppercase tracking-luxury text-muted-foreground">Checkout</span>
          <button onClick={onClose} className="text-sm">Close</button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="aspect-[4/5] bg-muted overflow-hidden">
            {product.media?.[0]?.type === "image" && product.media[0].url && (
              <img src={product.media[0].url} alt={product.name} className="h-full w-full object-cover grayscale" />
            )}
            {product.media?.[0]?.type === "video" && (
              <video src={product.media[0].url} controls className="h-full w-full object-cover grayscale" />
            )}
          </div>

          {product.media.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.media.slice(1).map((m, i) => (
                <div key={i} className="aspect-square bg-muted overflow-hidden">
                  {m.type === "image" ? (
                    <img src={m.url} alt="" className="h-full w-full object-cover grayscale" />
                  ) : (
                    <video src={m.url} className="h-full w-full object-cover grayscale" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <h2 className="font-display text-3xl leading-tight">{product.name}</h2>
            {product.description && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{product.description}</p>
            )}
          </div>

          <div className="flex items-end justify-between border-t border-border pt-6">
            <div>
              <div className="text-[10px] uppercase tracking-luxury text-muted-foreground">Price</div>
              <div className="font-display text-2xl">
                {product.price_stars} <span className="text-smz tracking-luxury">{CONFIG.BRAND.currencyLabel}</span>
              </div>
            </div>
            <button
              onClick={buy}
              disabled={busy}
              className="px-6 py-3 bg-primary text-primary-foreground text-xs uppercase tracking-luxury disabled:opacity-50"
            >
              {busy ? "Processing…" : "Pay with Stars"}
            </button>
          </div>

          {status && (
            <p className="text-xs font-bold text-center border-t border-border pt-4 text-foreground">
              {status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}