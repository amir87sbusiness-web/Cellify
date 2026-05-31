/**
 * ============================================================================
 * FILE: src/routes/super-control-9xA3p.tsx
 * EN: Hidden admin panel. Email is locked to CONFIG.ADMIN_EMAIL. Auth uses
 *     Supabase Auth (email + password). Create the admin user in your
 *     Supabase project's Authentication > Users panel with this email.
 *     After login you get full CRUD over the products table.
 *
 * FA: پنل مخفی مدیریت. ایمیل مدیر از فایل config خوانده می‌شود. اول باید در
 *     پنل Supabase کاربری با همین ایمیل و یک رمز عبور بسازید. سپس از همین
 *     صفحه وارد شوید و محصولات را اضافه/ویرایش/حذف کنید.
 *
 * You can change: form styling, fields displayed in the product editor.
 * Do NOT change the route path unless you also update CONFIG.ADMIN_ROUTE.
 * ============================================================================
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CONFIG, isSupabaseConfigured } from "@/config";
import { getSupabase } from "@/lib/supabase-client";
import {
  listAllProducts,
  upsertProduct,
  deleteProduct,
  type Product,
  type ProductMedia,
} from "@/lib/products";

export const Route = createFileRoute("/super-control-9xA3p")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Cellify · Admin" }] }),
  component: AdminPage,
});

function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setAuthed(false); return; }
    sb.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user && data.user.email === CONFIG.ADMIN_EMAIL);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user && session.user.email === CONFIG.ADMIN_EMAIL);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-5 flex items-center justify-between">
        <span className="text-xs uppercase tracking-luxury">Cellify · Control</span>
        {authed && (
          <button
            onClick={() => getSupabase()?.auth.signOut()}
            className="text-xs uppercase tracking-luxury text-muted-foreground"
          >
            Sign out
          </button>
        )}
      </header>

      {!isSupabaseConfigured() ? (
        <NotConfigured />
      ) : authed === null ? (
        <div className="p-12 text-center text-sm text-muted-foreground">Checking session…</div>
      ) : authed ? (
        <AdminDashboard />
      ) : (
        <LoginForm />
      )}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="mx-auto max-w-md p-12 text-center">
      <p className="text-xs uppercase tracking-luxury text-muted-foreground">Configuration required</p>
      <p className="mt-4 text-sm">
        Add your Supabase URL and anon key in <code className="font-mono">src/config.ts</code>, then create an admin
        user with email <span className="font-mono">{CONFIG.ADMIN_EMAIL}</span> in the Supabase dashboard.
      </p>
    </div>
  );
}

function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signInWithPassword({ email: CONFIG.ADMIN_EMAIL, password });
    if (error) setErr(error.message);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm p-12 space-y-5">
      <div>
        <h1 className="font-display text-3xl">Sign in</h1>
        <p className="mt-2 text-xs uppercase tracking-luxury text-muted-foreground">Administrator only</p>
      </div>
      <div className="space-y-2">
        <label className="block text-[10px] uppercase tracking-luxury text-muted-foreground">Email</label>
        <input
          type="email"
          value={CONFIG.ADMIN_EMAIL}
          readOnly
          className="w-full border border-border bg-muted px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[10px] uppercase tracking-luxury text-muted-foreground">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full bg-primary text-primary-foreground py-3 text-xs uppercase tracking-luxury disabled:opacity-50"
      >
        {busy ? "Authenticating…" : "Enter"}
      </button>
    </form>
  );
}

function emptyProduct(): Partial<Product> {
  return { name: "", description: "", price_stars: 0, media: [], file_url: "", active: true };
}

function AdminDashboard() {
  const [items, setItems] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Partial<Product> | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setItems(await listAllProducts());
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    if (!draft || !draft.name) return;
    await upsertProduct({
      ...(draft as Product),
      price_stars: Number(draft.price_stars ?? 0),
      media: draft.media ?? [],
    });
    setDraft(null);
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this product?")) return;
    await deleteProduct(id);
    refresh();
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Catalog</h1>
        <button
          onClick={() => setDraft(emptyProduct())}
          className="bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-luxury"
        >
          New product
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="border border-border divide-y divide-border">
          {items.length === 0 && <div className="p-6 text-sm text-muted-foreground">No products yet.</div>}
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-14 w-14 bg-muted overflow-hidden flex-shrink-0">
                  {p.media?.[0]?.url && (
                    <img src={p.media[0].url} alt="" className="h-full w-full object-cover grayscale" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.price_stars} {CONFIG.BRAND.currencyLabel} · {p.active ? "active" : "hidden"}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 text-xs uppercase tracking-luxury">
                <button onClick={() => setDraft(p)} className="px-3 py-1 border border-border">Edit</button>
                <button onClick={() => remove(p.id)} className="px-3 py-1 border border-destructive text-destructive">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && <ProductEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} />}
    </div>
  );
}

function ProductEditor({
  draft, setDraft, onSave, onCancel,
}: {
  draft: Partial<Product>;
  setDraft: (p: Partial<Product>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const media: ProductMedia[] = draft.media ?? [];
  const update = (patch: Partial<Product>) => setDraft({ ...draft, ...patch });

  function addMedia(type: "image" | "video") {
    const url = prompt(`${type} URL`);
    if (!url) return;
    update({ media: [...media, { type, url }] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">{draft.id ? "Edit" : "New"} product</h2>
          <button onClick={onCancel} className="text-sm">Close</button>
        </div>

        <Field label="Name">
          <input value={draft.name ?? ""} onChange={(e) => update({ name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={draft.description ?? ""} onChange={(e) => update({ description: e.target.value })} className={inputCls} />
        </Field>
        <Field label={`Price (${CONFIG.BRAND.currencyLabel})`}>
          <input type="number" min={0} value={draft.price_stars ?? 0} onChange={(e) => update({ price_stars: Number(e.target.value) })} className={inputCls} />
        </Field>
        <Field label="Digital file URL (delivered after payment)">
          <input value={draft.file_url ?? ""} onChange={(e) => update({ file_url: e.target.value })} className={inputCls} />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-luxury text-muted-foreground">Media</span>
            <div className="flex gap-2 text-xs">
              <button onClick={() => addMedia("image")} className="px-2 py-1 border border-border">+ Image</button>
              <button onClick={() => addMedia("video")} className="px-2 py-1 border border-border">+ Video</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {media.map((m, i) => (
              <div key={i} className="relative aspect-square bg-muted overflow-hidden">
                {m.type === "image"
                  ? <img src={m.url} alt="" className="h-full w-full object-cover grayscale" />
                  : <video src={m.url} className="h-full w-full object-cover grayscale" />}
                <button
                  onClick={() => update({ media: media.filter((_, j) => j !== i) })}
                  className="absolute top-1 right-1 bg-background/90 text-foreground text-[10px] px-1"
                >×</button>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.active ?? true} onChange={(e) => update({ active: e.target.checked })} />
          Visible in storefront
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-xs uppercase tracking-luxury border border-border">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 text-xs uppercase tracking-luxury bg-primary text-primary-foreground">Save</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] uppercase tracking-luxury text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
