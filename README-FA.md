# راهنمای راه‌اندازی Cellify (فارسی)

> این فایل راهنمای کامل پروژه‌ی Cellify است؛ یک Mini App تلگرامی لوکس و مینیمال برای فروش محصولات دیجیتال با پرداخت از طریق **Telegram Stars**. تمام تنظیمات از یک فایل مرکزی خوانده می‌شود تا راه‌اندازی برای شما ساده باشد.

---

## ۱) ساختار پروژه

```
src/
├─ config.ts                ← تمام کلیدها و تنظیمات اینجاست
├─ lib/
│  ├─ supabase-client.ts    ← اتصال به Supabase
│  ├─ telegram.ts           ← SDK تلگرام (تم، Stars، haptic)
│  └─ products.ts           ← لایه‌ی داده‌ی محصولات
├─ components/cellify/      ← اجزای رابط کاربری
└─ routes/
   ├─ index.tsx                       ← صفحه‌ی فروشگاه (SPA)
   └─ super-control-9xA3p.tsx         ← پنل مخفی مدیریت
```

> در ابتدای **هر فایل** یک بلوک توضیح به انگلیسی و فارسی نوشته شده که می‌گوید کدام بخش‌ها را می‌توانید تغییر دهید.

---

## ۲) پر کردن فایل پیکربندی

تنها فایلی که باید برای راه‌اندازی ویرایش کنید: `src/config.ts`

```ts
export const CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",

  TELEGRAM_BOT_TOKEN: "1234567890:AA...",   // فقط در سمت سرور/بات استفاده می‌شود
  TELEGRAM_BOT_USERNAME: "CellifyBot",
  TELEGRAM_PROVIDER_TOKEN: "",              // برای Stars خالی بماند

  ADMIN_EMAIL: "amir.templates@gmail.com",
  ADMIN_ROUTE: "/super-control-9xA3p",
  ...
};
```

⚠️ هیچ کلیدی را در سایر فایل‌ها هاردکد نکنید. همه‌چیز از همین فایل خوانده می‌شود.

---

## ۳) راه‌اندازی Supabase

۱. در [supabase.com](https://supabase.com) یک پروژه‌ی جدید بسازید.
۲. از بخش **Project Settings → API**، مقادیر `URL` و `anon public` را در `config.ts` قرار دهید.
۳. وارد **SQL Editor** شوید و دستورات زیر را اجرا کنید:

```sql
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_stars integer not null default 0,
  media jsonb not null default '[]'::jsonb,
  file_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "public read" on public.products
  for select using (active = true);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  telegram_user_id bigint not null,
  amount_stars integer not null,
  status text not null default 'pending',
  payload text,
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
```

۴. در بخش **Authentication → Users** یک کاربر با ایمیل `amir.templates@gmail.com` و رمز عبور دلخواه ایجاد کنید. این تنها کاربری است که اجازه‌ی ورود به پنل ادمین را دارد.

۵. (اختیاری) برای آن‌که پنل ادمین بتواند محصولات را ویرایش/حذف کند، یک Policy نوشتاری برای کاربر ادمین اضافه کنید:

```sql
create policy "admin write" on public.products
  for all using (auth.jwt()->>'email' = 'amir.templates@gmail.com')
  with check  (auth.jwt()->>'email' = 'amir.templates@gmail.com');
```

---

## ۴) راه‌اندازی بات تلگرام و پرداخت Stars

۱. از طریق [@BotFather](https://t.me/BotFather) یک بات بسازید و توکن آن را در `TELEGRAM_BOT_TOKEN` بگذارید.
۲. دستور `/newapp` را در BotFather اجرا کنید و آدرس Mini App را به پروژه‌ی دیپلوی‌شده‌ی خود وصل کنید.
۳. در بات، Stars را فعال کنید (Bot Settings → Payments → Telegram Stars). برای Stars نیازی به Provider Token نیست.

### تولید لینک پرداخت

فرانت‌اند یک تابع SQL با نام `create_stars_invoice` را صدا می‌زند. این تابع را در Supabase بسازید و در آن به Bot API تلگرام درخواست `createInvoiceLink` بفرستید (currency = `XTR`). نمونه‌ی شِمای ورودی/خروجی:

- ورودی: `p_product_id uuid`, `p_telegram_user_id bigint`
- خروجی: `{ "invoice_url": "https://t.me/$..." }`

### تحویل خودکار فایل پس از پرداخت

در سرور بات خود به Update با نوع `successful_payment` گوش بدهید. هنگام رسیدن پرداخت موفق:

1. سفارش را در جدول `orders` با وضعیت `paid` به‌روزرسانی کنید.
2. فایل دیجیتال محصول (`file_url`) را با متد `sendDocument` به همان `chat_id` کاربر بفرستید.

---

## ۵) ورود به پنل مدیریت

به آدرس زیر بروید:

```
/super-control-9xA3p
```

- ایمیل به صورت پیش‌فرض روی `amir.templates@gmail.com` قفل است.
- رمز عبور همان است که در Supabase تعیین کرده‌اید.
- پس از ورود می‌توانید محصولات را اضافه/ویرایش/حذف کنید و چندین عکس یا ویدئو برایشان آپلود کنید (با وارد کردن URL مدیا).

---

## ۶) طراحی و رابط کاربری

- پالت کاملاً **سیاه و سفید** (لوکس و مینیمال).
- تایپوگرافی: «Cormorant Garamond» برای تیترها و «Inter» برای متن.
- در داخل تلگرام، تم تاریک/روشن به‌صورت خودکار با تم کاربر هماهنگ می‌شود.
- تمام صفحه به‌صورت **SPA** کار می‌کند؛ کلیک روی محصول، پنل خرید را در همان صفحه باز می‌کند.

---

## ۷) اجرا و توسعه

```bash
bun install
bun run dev
```

برای دیپلوی، خروجی پروژه را روی هر هاست TanStack Start (Cloudflare Workers / Vercel Edge) بالا بیاورید و آدرس را در BotFather به Mini App متصل کنید.

---

موفق باشید 🤍
