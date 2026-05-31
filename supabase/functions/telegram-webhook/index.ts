import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (req) => {
  try {
    const update = await req.json()
    
    // بررسی می‌کنیم که آیا این آپدیت، یک پرداخت موفق است؟
    if (update.message?.successful_payment) {
      const chatId = update.message.chat.id
      const paymentInfo = update.message.successful_payment
      
      // در پایگاه داده ما invoice_payload را برابر با ID محصول قرار دادیم
      const productId = paymentInfo.invoice_payload 
      
      // اتصال ایمن به دیتابیس
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // گرفتن لینک فایل (گوگل شیت) از دیتابیس
      const { data: product } = await supabase
        .from('products')
        .select('file_url, name')
        .eq('id', productId)
        .single()

      if (product?.file_url) {
        // ارسال پیام تحویل محصول به خریدار
        const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
        const messageText = `🎉 پرداخت شما با موفقیت تایید شد!\n\nمحصول شما: **${product.name}**\n\nاز طریق لینک زیر می‌توانید به پلنر خود دسترسی داشته باشید (یک کپی از فایل بگیرید):\n${product.file_url}`

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: 'Markdown'
          })
        })
      }
    }
    
    // تلگرام همیشه نیاز دارد که ما وضعیت 200 را برگردانیم
    return new Response("OK", { status: 200 })
    
  } catch (err) {
    console.error("Webhook Error:", err)
    return new Response("Error", { status: 500 })
  }
})