"use strict";

// ═══════════════════════════════════════════════════════════════
//  DEPENDENCIES & CONFIG
// ═══════════════════════════════════════════════════════════════
const TelegramBot = require("node-telegram-bot-api");
const fs   = require("fs");
const path = require("path");

const TOKEN    = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID, 10);
const DATA_FILE   = path.join(process.cwd(), "data.json");
const BACKUP_DIR  = path.join(process.cwd(), "backups");

if (!TOKEN)    { console.error("BOT_TOKEN env var is required");  process.exit(1); }
if (!ADMIN_ID) { console.error("ADMIN_ID env var is required");   process.exit(1); }

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const bot = new TelegramBot(TOKEN, { polling: true });

// ═══════════════════════════════════════════════════════════════
//  DEFAULT DATA SCHEMA
// ═══════════════════════════════════════════════════════════════
const DEFAULT_DATA = {
  texts: {
    welcome:             "👋 Welcome to our store!\n\nBrowse our products below.",
    guide:               "📋 How to buy:\n1. Pick a product\n2. Send payment\n3. Wait for approval",
    paymentInstructions: "💳 Send payment to:\nCard: {card}\nOwner: {owner}\n\nThen send your receipt here.",
    approvedMsg:         "✅ Your payment was approved! Your files are attached below.",
    rejectedMsg:         "❌ Your payment was rejected. Please contact support."
  },
  payment: { card: "0000 0000 0000 0000", owner: "Store Owner" },
  products:  [],   // active products
  archived:  [],   // archived products
  users:     {},   // userId → UserRecord
  affiliates:{},   // code → AffiliateRecord
  orders:    {},   // orderId → OrderRecord
  analytics: {
    global: {
      totalViews: 0, totalBuyClicks: 0, totalReceipts: 0,
      totalApproved: 0, totalRejected: 0
    },
    perProduct: {},   // productId → { views, buyClicks, receipts, approved, rejected }
    dailyStats: {}    // YYYY-MM-DD → { newUsers, views, buyClicks, receipts, approved, rejected, revenue }
  }
};

// ═══════════════════════════════════════════════════════════════
//  DATA LAYER
// ═══════════════════════════════════════════════════════════════
function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw    = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_DATA, parsed);
    }
  } catch (e) { console.error("Failed to load data.json:", e.message); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8"); }
  catch (e) { console.error("Failed to save data.json:", e.message); }
}

let db = loadData();

// ═══════════════════════════════════════════════════════════════
//  BACKUP SYSTEM
// ═══════════════════════════════════════════════════════════════
function createBackup() {
  try {
    const ts   = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(BACKUP_DIR, `backup-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(db, null, 2), "utf8");
    // Keep latest 20
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
      .sort();
    if (files.length > 20) {
      files.slice(0, files.length - 20).forEach(f =>
        fs.unlinkSync(path.join(BACKUP_DIR, f)));
    }
    return file;
  } catch (e) { console.error("Backup failed:", e.message); return null; }
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
      .sort().reverse().slice(0, 20);
  } catch { return []; }
}

function restoreBackup(filename) {
  try {
    const file = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(file)) return false;
    const raw = fs.readFileSync(file, "utf8");
    db = deepMerge(DEFAULT_DATA, JSON.parse(raw));
    saveData();
    return true;
  } catch (e) { console.error("Restore failed:", e.message); return false; }
}

// Auto backup every 6 hours
setInterval(() => { createBackup(); }, 6 * 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
//  RATE LIMITING / ANTI-SPAM
// ═══════════════════════════════════════════════════════════════
const rateLimitMap  = {};  // userId → { count, windowStart }
const RATE_LIMIT    = 30;  // max actions per window
const RATE_WINDOW   = 60 * 1000; // 1 minute

function checkRateLimit(userId) {
  const now    = Date.now();
  const record = rateLimitMap[userId];
  if (!record || now - record.windowStart > RATE_WINDOW) {
    rateLimitMap[userId] = { count: 1, windowStart: now };
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

// Duplicate receipt protection: track last receipt hash per user
function receiptHash(msg) {
  if (msg.photo)    return "ph_" + msg.photo[msg.photo.length - 1].file_unique_id;
  if (msg.document) return "doc_" + msg.document.file_unique_id;
  if (msg.text)     return "tx_" + msg.text.slice(0, 80);
  return "unk_" + Date.now();
}

const recentReceipts = {}; // userId → hash

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function isAdmin(userId) { 
  return String(userId) === String(ADMIN_ID); 
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function pct(a, b) {
  if (!b) return "0%";
  return (((a / b) * 100).toFixed(1)) + "%";
}

function numFmt(n) { return Number(n || 0).toLocaleString(); }

function fillTemplate(text) {
  return text.replace("{card}", db.payment.card).replace("{owner}", db.payment.owner);
}

function getProduct(id) {
  return db.products.find(p => p.id === id) || db.archived.find(p => p.id === id);
}

function getActiveProduct(id) { return db.products.find(p => p.id === id); }

function formatPrice(product) {
  if (product.discountPrice) return `~~${product.price}~~ *${product.discountPrice}*`;
  return `*${product.price}*`;
}

function parseNumericPrice(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;
}

// ═══════════════════════════════════════════════════════════════
//  ANALYTICS HELPERS
// ═══════════════════════════════════════════════════════════════
function ensureProductAnalytics(productId) {
  if (!db.analytics.perProduct[productId]) {
    db.analytics.perProduct[productId] = {
      views: 0, buyClicks: 0, receipts: 0, approved: 0, rejected: 0
    };
  }
  return db.analytics.perProduct[productId];
}

function bumpDaily(field, amount = 1) {
  const key = todayKey();
  if (!db.analytics.dailyStats[key]) db.analytics.dailyStats[key] = {};
  db.analytics.dailyStats[key][field] = (db.analytics.dailyStats[key][field] || 0) + amount;
}

function trackView(productId) {
  ensureProductAnalytics(productId).views++;
  db.analytics.global.totalViews++;
  bumpDaily("views");
  saveData();
}

function trackBuyClick(productId) {
  ensureProductAnalytics(productId).buyClicks++;
  db.analytics.global.totalBuyClicks++;
  bumpDaily("buyClicks");
  saveData();
}

function trackReceipt(productId) {
  ensureProductAnalytics(productId).receipts++;
  db.analytics.global.totalReceipts++;
  bumpDaily("receipts");
  saveData();
}

function trackApproved(productId, userId, revenueStr) {
  ensureProductAnalytics(productId).approved++;
  db.analytics.global.totalApproved++;
  bumpDaily("approved");
  const rev = parseNumericPrice(revenueStr);
  if (rev) bumpDaily("revenue", rev);
  const u = db.users[userId];
  if (u) {
    u.purchases = (u.purchases || 0) + 1;
    u.totalSpending = (u.totalSpending || 0) + rev;
  }
  saveData();
}

function trackRejected(productId) {
  ensureProductAnalytics(productId).rejected++;
  db.analytics.global.totalRejected++;
  bumpDaily("rejected");
  saveData();
}

// ═══════════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function trackUser(userId, from, affiliateCode) {
  const uid = String(userId);
  if (!db.users[uid]) {
    const ref = affiliateCode && db.affiliates[affiliateCode] ? affiliateCode : null;
    db.users[uid] = {
      id: uid,
      username:      from.username || "",
      firstName:     from.first_name || "",
      joinedAt:      Date.now(),
      purchases:     0,
      totalSpending: 0,
      affiliateCode: ref
    };
    if (ref) {
      const aff = db.affiliates[ref];
      aff.usersReferred = (aff.usersReferred || 0) + 1;
      bumpDaily("newAffiliateUsers");
    }
    bumpDaily("newUsers");
    saveData();
    return true; // new user
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  AFFILIATE SYSTEM
// ═══════════════════════════════════════════════════════════════
function createAffiliate(name, commissionPct) {
  const code = genId();
  db.affiliates[code] = {
    code, name,
    commissionPct: commissionPct || 10,
    clicks: 0, usersReferred: 0, purchases: 0,
    approvedSales: 0, commissionEarned: 0,
    createdAt: Date.now()
  };
  saveData();
  return code;
}

function getAffiliateByCode(code) { return db.affiliates[code] || null; }

function creditAffiliateForOrder(order) {
  if (!order) return;
  const user = db.users[String(order.userId)];
  if (!user || !user.affiliateCode) return;
  const aff = db.affiliates[user.affiliateCode];
  if (!aff) return;
  aff.purchases      = (aff.purchases || 0) + 1;
  aff.approvedSales  = (aff.approvedSales || 0) + 1;
  const rev = parseNumericPrice(order.amount);
  const commission = rev * (aff.commissionPct / 100);
  aff.commissionEarned = (aff.commissionEarned || 0) + commission;
  saveData();
}

// ═══════════════════════════════════════════════════════════════
//  SESSION / STATE MACHINE
// ═══════════════════════════════════════════════════════════════
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) sessions[userId] = { step: null, data: {} };
  return sessions[userId];
}

function setStep(userId, step, data = {}) { sessions[userId] = { step, data }; }
function clearStep(userId)                { sessions[userId] = { step: null, data: {} }; }

// ═══════════════════════════════════════════════════════════════
//  KEYBOARDS
// ═══════════════════════════════════════════════════════════════
const CB = {
  HOME:           "home",
  CANCEL:         "cancel_action",
  PRODUCTS_LIST:  "products_list",
  SHOW_GUIDE:     "show_guide",
  ADMIN_PANEL:    "admin_panel",
  ADMIN_PRODUCTS: "admin_products",
  ADMIN_ADD_PROD: "admin_add_product",
  ADMIN_TEXTS:    "admin_texts",
  ADMIN_PAYMENT:  "admin_payment",
  ADMIN_ANALYTICS:"admin_analytics",
  ADMIN_ORDERS:   "admin_orders",
  ADMIN_USERS:    "admin_users",
  ADMIN_AFFILIATES:"admin_affiliates",
  ADMIN_BACKUPS:  "admin_backups",
  ADMIN_DASHBOARD:"admin_dashboard",
  ADMIN_ARCHIVED: "admin_archived",
  ADMIN_SEARCH:   "admin_search"
};

function kb(...rows) { return { inline_keyboard: rows }; }
function btn(text, cb) { return { text, callback_data: cb }; }

function mainMenuKeyboard(adminUser) {
  const rows = [
    [btn("🛍 Products", CB.PRODUCTS_LIST), btn("🔍 Search", "user_search")],
    [btn("📖 Guide", CB.SHOW_GUIDE)]
  ];
  if (adminUser) rows.push([btn("⚙️ Admin Panel", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

function productsListKeyboard(page = 0) {
  const PAGE_SIZE = 6;
  const active = db.products;
  const start  = page * PAGE_SIZE;
  const slice  = active.slice(start, start + PAGE_SIZE);
  const rows   = slice.map(p => [btn(
    `${p.name} — ${p.discountPrice || p.price}`,
    `product_${p.id}`
  )]);
  const nav = [];
  if (page > 0)                       nav.push(btn("◀️ Prev", `products_page_${page - 1}`));
  if (start + PAGE_SIZE < active.length) nav.push(btn("Next ▶️", `products_page_${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn("🔍 Search", "user_search"), btn("🏠 Home", CB.HOME)]);
  return { inline_keyboard: rows };
}

function productKeyboard(productId) {
  return kb(
    [btn("💳 Buy Now", `buy_${productId}`)],
    [btn("◀️ Back to Products", CB.PRODUCTS_LIST)],
    [btn("🏠 Home", CB.HOME)]
  );
}

function adminPanelKeyboard() {
  return kb(
    [btn("📊 Dashboard",        CB.ADMIN_DASHBOARD), btn("📈 Analytics",    CB.ADMIN_ANALYTICS)],
    [btn("📦 Products",         CB.ADMIN_PRODUCTS),  btn("🗂 Archived",     CB.ADMIN_ARCHIVED)],
    [btn("🧾 Orders",           CB.ADMIN_ORDERS),    btn("👥 Users",        CB.ADMIN_USERS)],
    [btn("🤝 Affiliates",       CB.ADMIN_AFFILIATES),btn("💾 Backups",      CB.ADMIN_BACKUPS)],
    [btn("✏️ Texts",            CB.ADMIN_TEXTS),     btn("💳 Payment Info", CB.ADMIN_PAYMENT)],
    [btn("🔍 Search",           CB.ADMIN_SEARCH)],
    [btn("🏠 Home",             CB.HOME)]
  );
}

function adminProductsKeyboard() {
  const rows = db.products.map((p, i) => [
    btn(`${i + 1}. ${p.name}`, `admin_edit_product_${p.id}`)
  ]);
  rows.push([btn("➕ Add Product", CB.ADMIN_ADD_PROD)]);
  rows.push([btn("◀️ Back", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

function adminEditProductKeyboard(productId) {
  return kb(
    [btn("📝 Name",        `admpf_${productId}_name`),
     btn("📄 Description", `admpf_${productId}_description`)],
    [btn("💰 Price",       `admpf_${productId}_price`),
     btn("🏷 Discount",    `admpf_${productId}_discountPrice`)],
    [btn("🖼 Add Gallery", `admpf_${productId}_gallery`),
     btn("📎 Add Delivery",`admpf_${productId}_delivery`)],
    [btn("🖼 View Gallery",    `admin_view_gallery_${productId}`),
     btn("📎 View Delivery",   `admin_view_delivery_${productId}`)],
    [btn("📋 Duplicate",   `admin_dup_product_${productId}`),
     btn("📦 Archive",     `admin_archive_product_${productId}`)],
    [btn("⬆️ Move Up",    `admin_prod_up_${productId}`),
     btn("⬇️ Move Down",  `admin_prod_down_${productId}`)],
    [btn("🗑 Delete",      `admin_delete_product_${productId}`)],
    [btn("◀️ Back",        CB.ADMIN_PRODUCTS)]
  );
}

function adminTextsKeyboard() {
  const rows = Object.keys(db.texts).map(k => [btn(`✏️ ${k}`, `admin_text_${k}`)]);
  rows.push([btn("◀️ Back", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

function paymentApprovalKeyboard(orderId) {
  return kb([btn("✅ Approve", `approve_${orderId}`), btn("❌ Reject", `reject_${orderId}`)]);
}

function cancelKeyboard(back) {
  return back
    ? kb([btn("❌ Cancel", CB.CANCEL)], [btn("◀️ Back", back)])
    : kb([btn("❌ Cancel", CB.CANCEL)]);
}

function ordersKeyboard(filter = "pending", page = 0) {
  const PAGE_SIZE = 8;
  const all = Object.values(db.orders)
    .filter(o => filter === "all" ? true : o.status === filter)
    .sort((a, b) => b.createdAt - a.createdAt);
  const slice = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rows  = slice.map(o => {
    const p = getProduct(o.productId);
    const label = `#${o.id.slice(-5)} | ${p ? p.name.slice(0, 12) : "?"} | ${o.status}`;
    return [btn(label, `admin_order_${o.id}`)];
  });
  const nav = [];
  if (page > 0)                              nav.push(btn("◀️ Prev", `admin_orders_${filter}_${page - 1}`));
  if ((page + 1) * PAGE_SIZE < all.length)   nav.push(btn("Next ▶️", `admin_orders_${filter}_${page + 1}`));
  if (nav.length) rows.push(nav);

  const filterBtns = [
    btn(filter === "pending"  ? "• Pending"  : "Pending",  `admin_orders_pending_0`),
    btn(filter === "approved" ? "• Approved" : "Approved", `admin_orders_approved_0`),
    btn(filter === "rejected" ? "• Rejected" : "Rejected", `admin_orders_rejected_0`)
  ];
  rows.push(filterBtns);
  rows.push([btn("◀️ Back", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

function affiliatesKeyboard() {
  const rows = Object.values(db.affiliates).map(a => [
    btn(`${a.name} (${a.commissionPct}%)`, `admin_aff_${a.code}`)
  ]);
  rows.push([btn("➕ Add Affiliate", "admin_add_affiliate")]);
  rows.push([btn("🏆 Leaderboard", "admin_aff_leaderboard")]);
  rows.push([btn("◀️ Back", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

function affiliateDetailKeyboard(code) {
  return kb(
    [btn("✏️ Name",       `admin_affpf_${code}_name`),
     btn("💸 Commission", `admin_affpf_${code}_commissionPct`)],
    [btn("🗑 Delete", `admin_delete_aff_${code}`)],
    [btn("◀️ Back",   CB.ADMIN_AFFILIATES)]
  );
}

function backupsKeyboard() {
  const files = listBackups();
  const rows  = files.slice(0, 10).map(f => [btn(`📂 ${f.slice(7, 26)}`, `admin_restore_${f}`)]);
  rows.push([btn("💾 Create Backup Now", "admin_backup_now")]);
  rows.push([btn("◀️ Back", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

function archivedKeyboard() {
  const rows = db.archived.map(p => [
    btn(`📦 ${p.name}`, `admin_restore_product_${p.id}`)
  ]);
  rows.push([btn("◀️ Back", CB.ADMIN_PANEL)]);
  if (!rows.length) return kb([btn("◀️ Back", CB.ADMIN_PANEL)]);
  return { inline_keyboard: rows };
}

// ═══════════════════════════════════════════════════════════════
//  SEND HELPERS
// ═══════════════════════════════════════════════════════════════
async function sendOrEdit(chatId, msgId, text, keyboard, extra = {}) {
  const opts = { parse_mode: "Markdown", reply_markup: keyboard, ...extra };
  if (msgId) {
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts });
      return null;
    } catch (_) {}
  }
  return bot.sendMessage(chatId, text, opts);
}

async function safeDelete(chatId, msgId) {
  try { await bot.deleteMessage(chatId, msgId); } catch (_) {}
}

async function sendFile(chatId, file, caption) {
  const opts = { caption, parse_mode: "Markdown" };
  if (file.type === "photo")    return bot.sendPhoto(chatId, file.fileId, opts);
  if (file.type === "video")    return bot.sendVideo(chatId, file.fileId, opts);
  if (file.type === "document") return bot.sendDocument(chatId, file.fileId, opts);
  if (file.type === "audio")    return bot.sendAudio(chatId, file.fileId, opts);
  return bot.sendDocument(chatId, file.fileId, opts);
}

async function sendProductGallery(chatId, product) {
  const gallery = product.gallery || [];
  for (let i = 0; i < gallery.length; i++) {
    try {
      await sendFile(chatId, gallery[i], i === 0 ? `🖼 *${product.name}* — Gallery` : "");
    } catch (e) { console.error("Gallery send err:", e.message); }
  }
}

async function sendDeliveryFiles(chatId, product) {
  const files = product.deliveryFiles || [];
  for (let i = 0; i < files.length; i++) {
    try {
      await sendFile(chatId, files[i],
        i === 0 ? `📦 *${product.name}* — File ${i + 1}/${files.length}` : `File ${i + 1}/${files.length}`);
    } catch (e) { console.error("Delivery send err:", e.message); }
  }
}

async function sendProductPage(chatId, productId, msgId) {
  const p = getActiveProduct(productId);
  if (!p) {
    return sendOrEdit(chatId, msgId, "❌ Product not found.",
      kb([btn("◀️ Back", CB.PRODUCTS_LIST)]));
  }

  const galleryCount   = (p.gallery       || []).length;
  const deliveryCount  = (p.deliveryFiles || []).length;

  const text = [
    `*${p.name}*`,
    "",
    p.description || "",
    "",
    `💰 Price: ${formatPrice(p)}`,
    galleryCount  ? `🖼 ${galleryCount} preview image(s)` : "",
    deliveryCount ? `📎 ${deliveryCount} delivery file(s)` : ""
  ].filter(v => v !== "").join("\n");

  const kbrd = productKeyboard(productId);

  // Send first gallery image as the main visual if exists
  if (galleryCount > 0) {
    const first = p.gallery[0];
    if (msgId) await safeDelete(chatId, msgId);
    try {
      const sendOpts = { caption: text, parse_mode: "Markdown", reply_markup: kbrd };
      if (first.type === "photo")    await bot.sendPhoto(chatId, first.fileId, sendOpts);
      else if (first.type === "video") await bot.sendVideo(chatId, first.fileId, sendOpts);
      else await bot.sendDocument(chatId, first.fileId, sendOpts);
      // Additional gallery images
      for (let i = 1; i < p.gallery.length; i++) {
        try { await sendFile(chatId, p.gallery[i], ""); } catch (_) {}
      }
      return;
    } catch (e) { /* fall through to text */ }
  }

  // Legacy single media
  if (p.media && p.media.fileId) {
    if (msgId) await safeDelete(chatId, msgId);
    const sendOpts = { caption: text, parse_mode: "Markdown", reply_markup: kbrd };
    if (p.media.type === "photo")    return bot.sendPhoto(chatId, p.media.fileId, sendOpts);
    if (p.media.type === "video")    return bot.sendVideo(chatId, p.media.fileId, sendOpts);
    if (p.media.type === "document") return bot.sendDocument(chatId, p.media.fileId, sendOpts);
  }

  return sendOrEdit(chatId, msgId, text, kbrd);
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCT WIZARD (add new product)
// ═══════════════════════════════════════════════════════════════
const WIZARD_STEPS   = ["name", "description", "price", "discountPrice"];
const WIZARD_PROMPTS = {
  name:          "📝 Product name?",
  description:   "📄 Description?",
  price:         "💰 Price? (e.g. $9.99)",
  discountPrice: "🏷 Discount price? (type `skip` to skip)"
};

async function continueNewProductWizard(chatId, userId, newProduct, justFilledField) {
  const idx       = WIZARD_STEPS.indexOf(justFilledField);
  const nextField = WIZARD_STEPS[idx + 1];

  if (!nextField) {
    if (newProduct.discountPrice === "skip") newProduct.discountPrice = null;
    newProduct.id           = genId();
    newProduct.gallery      = [];
    newProduct.deliveryFiles= [];
    newProduct.createdAt    = Date.now();
    db.products.push(newProduct);
    saveData();
    clearStep(userId);
    await bot.sendMessage(chatId,
      `✅ Product *${newProduct.name}* created!\n\nNow add gallery images and delivery files.`,
      { parse_mode: "Markdown", reply_markup: adminEditProductKeyboard(newProduct.id) });
    return;
  }

  setStep(userId, "await_product_field", { productId: "new", field: nextField, newProduct });
  await bot.sendMessage(chatId, WIZARD_PROMPTS[nextField],
    { parse_mode: "Markdown", reply_markup: cancelKeyboard(CB.ADMIN_PRODUCTS) });
}

// ═══════════════════════════════════════════════════════════════
//  RECEIPT / PAYMENT FLOW
// ═══════════════════════════════════════════════════════════════
async function handleReceiptSubmission(msg, productId) {
  const userId  = String(msg.from.id);
  const chatId  = msg.chat.id;
  const product = getActiveProduct(productId);

  if (!product) {
    clearStep(msg.from.id);
    return bot.sendMessage(chatId, "❌ Product no longer available.",
      { reply_markup: mainMenuKeyboard(false) });
  }

  // Duplicate receipt check
  const hash = receiptHash(msg);
  if (recentReceipts[userId] === hash) {
    return bot.sendMessage(chatId, "⚠️ Duplicate receipt detected. Please wait for your previous submission to be reviewed.");
  }
  recentReceipts[userId] = hash;

  const orderId = genId();
  db.orders[orderId] = {
    id:        orderId,
    userId:    userId,
    productId: productId,
    amount:    product.discountPrice || product.price,
    status:    "pending",
    createdAt: Date.now(),
    receiptHash: hash
  };
  saveData();
  clearStep(msg.from.id);

  trackReceipt(productId);

  const userTag    = msg.from.username ? `@${msg.from.username}` : `ID:${userId}`;
  const adminText  = [
    `🧾 *New Payment Receipt*`,
    ``,
    `👤 User: ${userTag} (${userId})`,
    `📦 Product: *${product.name}*`,
    `💰 Amount: ${product.discountPrice || product.price}`,
    `🆔 Order ID: \`${orderId}\``
  ].join("\n");

  const fwdOpts = { caption: adminText, parse_mode: "Markdown",
                    reply_markup: paymentApprovalKeyboard(orderId) };

  try {
    if (msg.photo)    await bot.sendPhoto(ADMIN_ID, msg.photo[msg.photo.length - 1].file_id, fwdOpts);
    else if (msg.document) await bot.sendDocument(ADMIN_ID, msg.document.file_id, fwdOpts);
    else {
      const extra = msg.text ? `\n\n📝 *Receipt text:*\n${msg.text}` : "";
      await bot.sendMessage(ADMIN_ID, adminText + extra,
        { parse_mode: "Markdown", reply_markup: paymentApprovalKeyboard(orderId) });
    }
  } catch (e) { console.error("Failed to forward receipt:", e.message); }

  await bot.sendMessage(chatId,
    "✅ Receipt received! We will verify your payment shortly.",
    { reply_markup: mainMenuKeyboard(false) });
}

// ═══════════════════════════════════════════════════════════════
//  APPROVE / REJECT
// ═══════════════════════════════════════════════════════════════
async function handleApprove(chatId, orderId) {
  const order = db.orders[orderId];
  if (!order || order.status !== "pending") {
    return bot.sendMessage(chatId, "⚠️ Order already processed or not found.");
  }
  order.status     = "approved";
  order.processedAt = Date.now();
  saveData();

  const product = getProduct(order.productId);
  trackApproved(order.productId, order.userId, order.amount);
  creditAffiliateForOrder(order);

  try {
    await bot.sendMessage(order.userId, db.texts.approvedMsg, { parse_mode: "Markdown" });
    if (product) {
      // Send all delivery files
      const files = product.deliveryFiles || [];
      if (files.length > 0) {
        await sendDeliveryFiles(order.userId, product);
      } else if (product.media && product.media.fileId) {
        // Legacy fallback
        await sendFile(order.userId, product.media, `📦 *${product.name}*`);
      }
    }
  } catch (e) { console.error("Failed to deliver to user:", e.message); }

  await bot.sendMessage(chatId,
    `✅ Order \`${orderId}\` approved. Delivery sent to user.`,
    { parse_mode: "Markdown" });
}

async function handleReject(chatId, orderId) {
  const order = db.orders[orderId];
  if (!order || order.status !== "pending") {
    return bot.sendMessage(chatId, "⚠️ Order already processed or not found.");
  }
  order.status      = "rejected";
  order.processedAt  = Date.now();
  saveData();

  trackRejected(order.productId);

  try {
    await bot.sendMessage(order.userId, db.texts.rejectedMsg, { parse_mode: "Markdown" });
  } catch (e) { console.error("Failed to notify user:", e.message); }

  await bot.sendMessage(chatId,
    `❌ Order \`${orderId}\` rejected. User notified.`,
    { parse_mode: "Markdown" });
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD & ANALYTICS TEXT
// ═══════════════════════════════════════════════════════════════
function buildDashboard() {
  const today  = todayKey();
  const ds     = db.analytics.dailyStats;
  const g      = db.analytics.global;
  const todaySt= ds[today] || {};

  // Weekly stats (last 7 days)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
  const weekly = last7.reduce((acc, d) => {
    const st = ds[d] || {};
    acc.sales    += st.approved  || 0;
    acc.revenue  += st.revenue   || 0;
    acc.newUsers += st.newUsers  || 0;
    return acc;
  }, { sales: 0, revenue: 0, newUsers: 0 });

  // Monthly
  const monthKey = today.slice(0, 7);
  const monthly  = Object.entries(ds)
    .filter(([k]) => k.startsWith(monthKey))
    .reduce((acc, [, st]) => {
      acc.sales   += st.approved  || 0;
      acc.revenue += st.revenue   || 0;
      acc.newUsers+= st.newUsers  || 0;
      return acc;
    }, { sales: 0, revenue: 0, newUsers: 0 });

  // Top products
  const topProducts = db.products
    .map(p => ({ name: p.name, sales: (db.analytics.perProduct[p.id] || {}).approved || 0 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  // Top affiliates
  const topAffiliates = Object.values(db.affiliates)
    .sort((a, b) => (b.commissionEarned || 0) - (a.commissionEarned || 0))
    .slice(0, 5);

  const totalUsers  = Object.keys(db.users).length;
  const totalOrders = Object.keys(db.orders).length;

  return [
    `📊 *Store Dashboard*`,
    ``,
    `👥 Total Users: *${numFmt(totalUsers)}*`,
    `🧾 Total Orders: *${numFmt(totalOrders)}*`,
    `✅ Total Approved: *${numFmt(g.totalApproved)}*`,
    ``,
    `📅 *Today (${today})*`,
    `  🆕 New Users:  ${todaySt.newUsers  || 0}`,
    `  👁 Views:      ${todaySt.views     || 0}`,
    `  🛒 Buy Clicks: ${todaySt.buyClicks || 0}`,
    `  🧾 Receipts:   ${todaySt.receipts  || 0}`,
    `  ✅ Approved:   ${todaySt.approved  || 0}`,
    `  ❌ Rejected:   ${todaySt.rejected  || 0}`,
    `  💰 Revenue:    ${todaySt.revenue   || 0}`,
    ``,
    `📆 *Last 7 Days*`,
    `  Sales: ${weekly.sales} | Revenue: ${weekly.revenue} | New Users: ${weekly.newUsers}`,
    ``,
    `🗓 *This Month (${monthKey})*`,
    `  Sales: ${monthly.sales} | Revenue: ${monthly.revenue} | New Users: ${monthly.newUsers}`,
    ``,
    `🏆 *Top Products*`,
    ...topProducts.map((p, i) => `  ${i + 1}. ${p.name} — ${p.sales} sales`),
    ``,
    `🤝 *Top Affiliates*`,
    ...topAffiliates.map((a, i) =>
      `  ${i + 1}. ${a.name} — ${a.approvedSales || 0} sales / ${(a.commissionEarned || 0).toFixed(2)} earned`)
  ].join("\n");
}

function buildFunnelAnalytics() {
  const g           = db.analytics.global;
  const totalUsers  = Object.keys(db.users).length;

  return [
    `📈 *Funnel Analytics*`,
    ``,
    `👥 Total Users:      *${numFmt(totalUsers)}*`,
    `👁 Product Views:    *${numFmt(g.totalViews)}*   (${pct(g.totalViews, totalUsers)} of users)`,
    `🛒 Buy Clicks:       *${numFmt(g.totalBuyClicks)}*   (${pct(g.totalBuyClicks, g.totalViews)} of views)`,
    `🧾 Receipts Sent:    *${numFmt(g.totalReceipts)}*   (${pct(g.totalReceipts, g.totalBuyClicks)} of buy clicks)`,
    `✅ Approved Sales:   *${numFmt(g.totalApproved)}*   (${pct(g.totalApproved, g.totalReceipts)} of receipts)`,
    `❌ Rejected Sales:   *${numFmt(g.totalRejected)}*`,
    ``,
    `📦 *Per-Product Analytics*`,
    ...db.products.map(p => {
      const s = db.analytics.perProduct[p.id] || {};
      return [
        `• *${p.name}*`,
        `  Views: ${s.views || 0} | Clicks: ${s.buyClicks || 0} | Receipts: ${s.receipts || 0}`,
        `  ✅ ${s.approved || 0} | ❌ ${s.rejected || 0} | Conv: ${pct(s.approved || 0, s.receipts || 0)}`
      ].join("\n");
    })
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════
//  /start COMMAND
// ═══════════════════════════════════════════════════════════════
bot.onText(/\/start(.*)/, async (msg, match) => {
  const userId       = msg.from.id;
  const affiliateArg = (match[1] || "").trim();

  if (!checkRateLimit(userId)) return;

  const isNew = trackUser(userId, msg.from, affiliateArg || null);

  // Track affiliate click
  if (affiliateArg && db.affiliates[affiliateArg]) {
    db.affiliates[affiliateArg].clicks =
      (db.affiliates[affiliateArg].clicks || 0) + 1;
    saveData();
  }

  clearStep(userId);
  await bot.sendMessage(msg.chat.id, db.texts.welcome, {
    parse_mode:   "Markdown",
    reply_markup: mainMenuKeyboard(isAdmin(userId))
  });
});

// ═══════════════════════════════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════
bot.on("message", async (msg) => {
  if (msg.text && msg.text.startsWith("/")) return;

  const userId  = msg.from.id;
  const chatId  = msg.chat.id;

  if (!checkRateLimit(userId)) return;

  trackUser(userId, msg.from, null);

  const session = getSession(userId);

  // ── State machine ──
  if (session.step === "await_product_field" && isAdmin(userId)) {
    await handleAdminProductFieldInput(msg, session.data);
    return;
  }

  if (session.step === "await_text_edit" && isAdmin(userId)) {
    if (!msg.text) return;
    db.texts[session.data.textKey] = msg.text;
    saveData();
    clearStep(userId);
    await bot.sendMessage(chatId,
      `✅ Text *${session.data.textKey}* updated.`,
      { parse_mode: "Markdown", reply_markup: adminTextsKeyboard() });
    return;
  }

  if (session.step === "await_payment_field" && isAdmin(userId)) {
    if (!msg.text) return;
    db.payment[session.data.field] = msg.text;
    saveData();
    clearStep(userId);
    await bot.sendMessage(chatId,
      `✅ Payment *${session.data.field}* updated to: \`${msg.text}\``,
      { parse_mode: "Markdown", reply_markup: adminPanelKeyboard() });
    return;
  }

  if (session.step === "await_affiliate_field" && isAdmin(userId)) {
    await handleAffiliateFieldInput(msg, session.data);
    return;
  }

  if (session.step === "await_affiliate_create" && isAdmin(userId)) {
    if (!msg.text) return;
    const parts = msg.text.split(" ");
    const name  = parts[0];
    const comm  = parseFloat(parts[1]) || 10;
    const code  = createAffiliate(name, comm);
    clearStep(userId);
    const botInfo = await bot.getMe().catch(() => ({ username: "yourbot" }));
    const link    = `https://t.me/${botInfo.username}?start=${code}`;
    await bot.sendMessage(chatId,
      `✅ Affiliate *${name}* created!\n\nCode: \`${code}\`\nLink: ${link}\nCommission: ${comm}%`,
      { parse_mode: "Markdown", reply_markup: affiliatesKeyboard() });
    return;
  }

  if (session.step === "await_user_search") {
    if (!msg.text) return;
    const query = msg.text.toLowerCase().trim();
    clearStep(userId);
    if (isAdmin(userId)) {
      await handleAdminSearch(chatId, query, session.data.searchType || "all");
    } else {
      await handleUserProductSearch(chatId, query);
    }
    return;
  }

  // ── User receipt submission ──
  if (!isAdmin(userId)) {
    const pendingProductId = session.data && session.data.pendingProductId;
    if (pendingProductId) {
      await handleReceiptSubmission(msg, pendingProductId);
    }
    return;
  }
});

// ═══════════════════════════════════════════════════════════════
//  ADMIN PRODUCT FIELD INPUT
// ═══════════════════════════════════════════════════════════════
async function handleAdminProductFieldInput(msg, sessionData) {
  const userId    = msg.from.id;
  const chatId    = msg.chat.id;
  const { productId, field } = sessionData;

  // Gallery / delivery file append
  if (field === "gallery" || field === "delivery") {
    let file = null;
    if (msg.photo)    file = { type: "photo",    fileId: msg.photo[msg.photo.length - 1].file_id,
                                                  fileName: "photo.jpg" };
    else if (msg.video)   file = { type: "video",    fileId: msg.video.file_id,
                                                       fileName: msg.video.file_name || "video.mp4" };
    else if (msg.document)file = { type: "document", fileId: msg.document.file_id,
                                                       fileName: msg.document.file_name || "file" };
    else if (msg.audio)   file = { type: "audio",    fileId: msg.audio.file_id,
                                                       fileName: msg.audio.file_name || "audio.mp3" };

    if (!file && msg.text && msg.text.toLowerCase() === "done") {
      clearStep(userId);
      if (productId !== "new") {
        await bot.sendMessage(chatId, "✅ Done adding files.",
          { reply_markup: adminEditProductKeyboard(productId) });
      }
      return;
    }

    if (!file) {
      await bot.sendMessage(chatId,
        "Send a file (photo/video/document/audio) or type `done` to finish.",
        { parse_mode: "Markdown", reply_markup: cancelKeyboard() });
      return;
    }

    if (productId === "new") {
      if (!sessionData.newProduct[field === "gallery" ? "gallery" : "deliveryFiles"])
        sessionData.newProduct[field === "gallery" ? "gallery" : "deliveryFiles"] = [];
      sessionData.newProduct[field === "gallery" ? "gallery" : "deliveryFiles"].push(file);
    } else {
      const p = getProduct(productId);
      if (p) {
        const arr = field === "gallery" ? "gallery" : "deliveryFiles";
        if (!p[arr]) p[arr] = [];
        p[arr].push(file);
        saveData();
      }
    }

    await bot.sendMessage(chatId,
      `✅ File added. Send another or type \`done\`.`,
      { parse_mode: "Markdown", reply_markup: cancelKeyboard() });
    return;
  }

  // Legacy single media (backward compat)
  if (field === "media") {
    let media = null;
    if (msg.photo)    media = { type: "photo",    fileId: msg.photo[msg.photo.length - 1].file_id };
    else if (msg.video)   media = { type: "video",    fileId: msg.video.file_id };
    else if (msg.document)media = { type: "document", fileId: msg.document.file_id };

    if (!media) {
      await bot.sendMessage(chatId, "❌ Please send a photo, video, or document.",
        { reply_markup: cancelKeyboard() });
      return;
    }

    if (productId !== "new") {
      const p = getProduct(productId);
      if (p) { p.media = media; saveData(); }
      clearStep(userId);
      await bot.sendMessage(chatId, "✅ Media updated.",
        { reply_markup: adminEditProductKeyboard(productId) });
      return;
    }
    sessionData.newProduct.media = media;
  } else {
    if (!msg.text) {
      await bot.sendMessage(chatId, "❌ Please send a text value.",
        { reply_markup: cancelKeyboard() });
      return;
    }
    const value = msg.text;

    if (productId !== "new") {
      const p = getProduct(productId);
      if (p) {
        if (field === "discountPrice" && value.toLowerCase() === "skip") {
          p[field] = null;
        } else {
          p[field] = value;
        }
        saveData();
        clearStep(userId);
        await bot.sendMessage(chatId, `✅ *${field}* updated.`,
          { parse_mode: "Markdown", reply_markup: adminEditProductKeyboard(productId) });
        return;
      }
    } else {
      sessionData.newProduct[field] = value;
    }
  }

  if (productId === "new") {
    await continueNewProductWizard(chatId, userId, sessionData.newProduct, field);
  }
}

// ═══════════════════════════════════════════════════════════════
//  AFFILIATE FIELD INPUT
// ═══════════════════════════════════════════════════════════════
async function handleAffiliateFieldInput(msg, sessionData) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  if (!msg.text) return;

  const { code, field } = sessionData;
  const aff = db.affiliates[code];
  if (!aff) { clearStep(userId); return; }

  if (field === "commissionPct") {
    aff.commissionPct = parseFloat(msg.text) || aff.commissionPct;
  } else {
    aff[field] = msg.text;
  }
  saveData();
  clearStep(userId);
  await bot.sendMessage(chatId, `✅ Affiliate *${field}* updated.`,
    { parse_mode: "Markdown", reply_markup: affiliateDetailKeyboard(code) });
}

// ═══════════════════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════════════════
async function handleUserProductSearch(chatId, query) {
  const results = db.products.filter(p =>
    p.name.toLowerCase().includes(query) ||
    (p.description || "").toLowerCase().includes(query)
  );

  if (!results.length) {
    return bot.sendMessage(chatId, `🔍 No products found for "*${query}*"`,
      { parse_mode: "Markdown", reply_markup: kb([btn("🛍 All Products", CB.PRODUCTS_LIST)]) });
  }

  const rows = results.map(p => [btn(`${p.name} — ${p.discountPrice || p.price}`, `product_${p.id}`)]);
  rows.push([btn("🛍 All Products", CB.PRODUCTS_LIST), btn("🏠 Home", CB.HOME)]);
  await bot.sendMessage(chatId,
    `🔍 Results for "*${query}*" (${results.length}):`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: rows } });
}

async function handleAdminSearch(chatId, query, type) {
  const lines = [];

  if (type === "all" || type === "products") {
    const prods = [...db.products, ...db.archived].filter(p =>
      p.name.toLowerCase().includes(query));
    if (prods.length) {
      lines.push(`📦 *Products (${prods.length})*`);
      prods.forEach(p => lines.push(`• ${p.name} [${p.id}]`));
    }
  }

  if (type === "all" || type === "orders") {
    const ords = Object.values(db.orders).filter(o =>
      o.id.toLowerCase().includes(query) ||
      String(o.userId).includes(query) ||
      o.status.includes(query));
    if (ords.length) {
      lines.push(`\n🧾 *Orders (${ords.length})*`);
      ords.slice(0, 10).forEach(o => {
        const p = getProduct(o.productId);
        lines.push(`• #${o.id.slice(-6)} | ${p ? p.name : "?"} | ${o.status}`);
      });
    }
  }

  if (type === "all" || type === "users") {
    const users = Object.values(db.users).filter(u =>
      (u.username || "").toLowerCase().includes(query) ||
      String(u.id).includes(query));
    if (users.length) {
      lines.push(`\n👥 *Users (${users.length})*`);
      users.slice(0, 10).forEach(u =>
        lines.push(`• ${u.username || u.firstName || "User"} (${u.id})`));
    }
  }

  if (!lines.length) lines.push(`🔍 No results found for "*${query}*"`);

  await bot.sendMessage(chatId, lines.join("\n"),
    { parse_mode: "Markdown", reply_markup: kb([btn("◀️ Back", CB.ADMIN_PANEL)]) });
}

// ═══════════════════════════════════════════════════════════════
//  CALLBACK QUERY HANDLER
// ═══════════════════════════════════════════════════════════════
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data;

  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (!checkRateLimit(userId)) return;

  // ── Universal navigation ──
  if (data === CB.HOME) {
    clearStep(userId);
    return sendOrEdit(chatId, msgId, db.texts.welcome, mainMenuKeyboard(isAdmin(userId)));
  }

  if (data === CB.CANCEL) {
    clearStep(userId);
    const dest = isAdmin(userId) ? adminPanelKeyboard() : mainMenuKeyboard(false);
    return sendOrEdit(chatId, msgId, "❌ Action cancelled.", dest);
  }

  if (data === CB.SHOW_GUIDE) {
    return sendOrEdit(chatId, msgId, db.texts.guide,
      kb([btn("🛍 Products", CB.PRODUCTS_LIST), btn("🏠 Home", CB.HOME)]));
  }

  // ── User product search ──
  if (data === "user_search") {
    setStep(userId, "await_user_search", { searchType: "products" });
    return sendOrEdit(chatId, msgId, "🔍 Enter search keyword:", cancelKeyboard());
  }

  // ── Products browsing ──
  if (data === CB.PRODUCTS_LIST || data.startsWith("products_page_")) {
    const page = data.startsWith("products_page_") ? parseInt(data.split("_").pop(), 10) : 0;
    if (!db.products.length) {
      return sendOrEdit(chatId, msgId, "🛍 No products available yet.",
        kb([btn("🏠 Home", CB.HOME)]));
    }
    return sendOrEdit(chatId, msgId, "🛍 *Our Products*\n\nSelect a product:",
      productsListKeyboard(page));
  }

  if (data.startsWith("product_")) {
    const productId = data.slice(8);
    trackView(productId);
    return sendProductPage(chatId, productId, msgId);
  }

  // ── Buy flow ──
  if (data.startsWith("buy_")) {
    const productId = data.slice(4);
    const product   = getActiveProduct(productId);
    if (!product) return;

    trackBuyClick(productId);

    const instructions = fillTemplate(db.texts.paymentInstructions);
    const text = [
      `📦 *${product.name}*`,
      `💰 Amount: ${product.discountPrice || product.price}`,
      ``,
      instructions
    ].join("\n");

    setStep(userId, null, { pendingProductId: productId });

    await safeDelete(chatId, msgId);
    return bot.sendMessage(chatId, text, {
      parse_mode:   "Markdown",
      reply_markup: kb([btn("🏠 Cancel", CB.HOME)])
    });
  }

  // ── Payment approval (admin) ──
  if (data.startsWith("approve_") && isAdmin(userId)) {
    return handleApprove(chatId, data.slice(8));
  }
  if (data.startsWith("reject_") && isAdmin(userId)) {
    return handleReject(chatId, data.slice(7));
  }

  // ══ ADMIN-ONLY BELOW ══
  if (!isAdmin(userId)) return;

  // ── Admin panel ──
  if (data === CB.ADMIN_PANEL) {
    return sendOrEdit(chatId, msgId, "⚙️ *Admin Panel*", adminPanelKeyboard());
  }

  // ── Dashboard ──
  if (data === CB.ADMIN_DASHBOARD) {
    return sendOrEdit(chatId, msgId, buildDashboard(),
      kb([btn("📈 Funnel", CB.ADMIN_ANALYTICS), btn("◀️ Back", CB.ADMIN_PANEL)]));
  }

  // ── Analytics ──
  if (data === CB.ADMIN_ANALYTICS) {
    return sendOrEdit(chatId, msgId, buildFunnelAnalytics(),
      kb([btn("📊 Dashboard", CB.ADMIN_DASHBOARD), btn("◀️ Back", CB.ADMIN_PANEL)]));
  }

  // ── Products management ──
  if (data === CB.ADMIN_PRODUCTS) {
    const text = `📦 *Products* (${db.products.length})\n\nSelect a product to edit:`;
    return sendOrEdit(chatId, msgId, text, adminProductsKeyboard());
  }

  if (data === CB.ADMIN_ADD_PROD) {
    setStep(userId, "await_product_field", { productId: "new", field: "name", newProduct: {} });
    return sendOrEdit(chatId, msgId, "📝 Enter product *name*:", cancelKeyboard(CB.ADMIN_PRODUCTS));
  }

  if (data.startsWith("admin_edit_product_")) {
    const productId = data.slice(19);
    const p = getProduct(productId);
    if (!p) return;
    const text = [
      `✏️ *Editing: ${p.name}*`,
      `📄 ${(p.description || "").slice(0, 120)}`,
      `💰 Price: ${p.price}${p.discountPrice ? ` / Sale: ${p.discountPrice}` : ""}`,
      `🖼 Gallery: ${(p.gallery || []).length} file(s)`,
      `📎 Delivery: ${(p.deliveryFiles || []).length} file(s)`
    ].join("\n");
    return sendOrEdit(chatId, msgId, text, adminEditProductKeyboard(productId));
  }

  if (data.startsWith("admpf_")) {
    // admpf_{productId}_{field}  — productId never contains underscore (genId uses alphanums)
    const parts     = data.split("_");
    const field     = parts[parts.length - 1];
    const productId = parts.slice(1, parts.length - 1).join("_");
    const prompts   = {
      name:          "📝 New name?",
      description:   "📄 New description?",
      price:         "💰 New price?",
      discountPrice: "🏷 New discount price? (or `skip` to remove)",
      gallery:       "🖼 Send gallery image/video. Type `done` when finished.",
      delivery:      "📎 Send delivery file. Type `done` when finished."
    };
    setStep(userId, "await_product_field", { productId, field });
    return sendOrEdit(chatId, msgId, prompts[field] || "Enter new value:", cancelKeyboard());
  }

  if (data.startsWith("admin_view_gallery_")) {
    const productId = data.slice(19);
    const p = getProduct(productId);
    if (!p) return;
    const gallery = p.gallery || [];
    if (!gallery.length) {
      return bot.sendMessage(chatId, "🖼 No gallery files.",
        { reply_markup: adminEditProductKeyboard(productId) });
    }
    await bot.sendMessage(chatId, `🖼 Gallery for *${p.name}* (${gallery.length} files):`,
      { parse_mode: "Markdown" });
    for (let i = 0; i < gallery.length; i++) {
      try {
        const delBtn = kb([btn(`🗑 Remove #${i + 1}`, `admin_rm_gallery_${productId}_${i}`)]);
        await sendFile(chatId, gallery[i], `#${i + 1}`);
        await bot.sendMessage(chatId, `File #${i + 1}: ${gallery[i].fileName || gallery[i].type}`,
          { reply_markup: delBtn });
      } catch (_) {}
    }
    return bot.sendMessage(chatId, "Done.", { reply_markup: adminEditProductKeyboard(productId) });
  }

  if (data.startsWith("admin_rm_gallery_")) {
    const parts     = data.split("_");
    const idx       = parseInt(parts[parts.length - 1], 10);
    const productId = parts.slice(3, parts.length - 1).join("_");
    const p = getProduct(productId);
    if (p && p.gallery) {
      p.gallery.splice(idx, 1);
      saveData();
    }
    return bot.sendMessage(chatId, "🗑 Gallery file removed.",
      { reply_markup: adminEditProductKeyboard(productId) });
  }

  if (data.startsWith("admin_view_delivery_")) {
    const productId = data.slice(20);
    const p = getProduct(productId);
    if (!p) return;
    const files = p.deliveryFiles || [];
    if (!files.length) {
      return bot.sendMessage(chatId, "📎 No delivery files.",
        { reply_markup: adminEditProductKeyboard(productId) });
    }
    await bot.sendMessage(chatId, `📎 Delivery for *${p.name}* (${files.length} files):`,
      { parse_mode: "Markdown" });
    for (let i = 0; i < files.length; i++) {
      try {
        const delBtn = kb([btn(`🗑 Remove #${i + 1}`, `admin_rm_delivery_${productId}_${i}`)]);
        await sendFile(chatId, files[i], `Delivery #${i + 1}`);
        await bot.sendMessage(chatId, `File #${i + 1}: ${files[i].fileName || files[i].type}`,
          { reply_markup: delBtn });
      } catch (_) {}
    }
    return bot.sendMessage(chatId, "Done.", { reply_markup: adminEditProductKeyboard(productId) });
  }

  if (data.startsWith("admin_rm_delivery_")) {
    const parts     = data.split("_");
    const idx       = parseInt(parts[parts.length - 1], 10);
    const productId = parts.slice(3, parts.length - 1).join("_");
    const p = getProduct(productId);
    if (p && p.deliveryFiles) {
      p.deliveryFiles.splice(idx, 1);
      saveData();
    }
    return bot.sendMessage(chatId, "🗑 Delivery file removed.",
      { reply_markup: adminEditProductKeyboard(productId) });
  }

  if (data.startsWith("admin_delete_product_")) {
    const productId = data.slice(21);
    db.products = db.products.filter(p => p.id !== productId);
    saveData();
    return sendOrEdit(chatId, msgId, "🗑 Product deleted.", adminProductsKeyboard());
  }

  if (data.startsWith("admin_archive_product_")) {
    const productId = data.slice(22);
    const idx = db.products.findIndex(p => p.id === productId);
    if (idx !== -1) {
      db.archived.push(db.products.splice(idx, 1)[0]);
      saveData();
    }
    return sendOrEdit(chatId, msgId, "📦 Product archived.", adminProductsKeyboard());
  }

  if (data === CB.ADMIN_ARCHIVED) {
    const text = db.archived.length
      ? `🗂 *Archived Products* (${db.archived.length})\n\nTap to restore:`
      : "🗂 No archived products.";
    return sendOrEdit(chatId, msgId, text, archivedKeyboard());
  }

  if (data.startsWith("admin_restore_product_")) {
    const productId = data.slice(22);
    const idx = db.archived.findIndex(p => p.id === productId);
    if (idx !== -1) {
      db.products.push(db.archived.splice(idx, 1)[0]);
      saveData();
      return sendOrEdit(chatId, msgId, "✅ Product restored.", adminProductsKeyboard());
    }
    return bot.sendMessage(chatId, "❌ Product not found.");
  }

  if (data.startsWith("admin_dup_product_")) {
    const productId  = data.slice(18);
    const p = getProduct(productId);
    if (p) {
      const dup = JSON.parse(JSON.stringify(p));
      dup.id   = genId();
      dup.name = dup.name + " (copy)";
      db.products.push(dup);
      saveData();
      return sendOrEdit(chatId, msgId, `✅ Product duplicated as *${dup.name}*`,
        adminEditProductKeyboard(dup.id));
    }
    return;
  }

  if (data.startsWith("admin_prod_up_") || data.startsWith("admin_prod_down_")) {
    const up        = data.startsWith("admin_prod_up_");
    const productId = up ? data.slice(14) : data.slice(16);
    const idx       = db.products.findIndex(p => p.id === productId);
    if (idx !== -1) {
      const swapIdx = up ? idx - 1 : idx + 1;
      if (swapIdx >= 0 && swapIdx < db.products.length) {
        [db.products[idx], db.products[swapIdx]] = [db.products[swapIdx], db.products[idx]];
        saveData();
      }
    }
    return sendOrEdit(chatId, msgId, `📦 *Products*`, adminProductsKeyboard());
  }

  // ── Texts ──
  if (data === CB.ADMIN_TEXTS) {
    return sendOrEdit(chatId, msgId, "✏️ *Edit Texts*\n\nSelect a text to edit:", adminTextsKeyboard());
  }
  if (data.startsWith("admin_text_")) {
    const textKey = data.slice(11);
    if (!Object.prototype.hasOwnProperty.call(db.texts, textKey)) return;
    setStep(userId, "await_text_edit", { textKey });
    return sendOrEdit(chatId, msgId,
      `✏️ *Editing: ${textKey}*\n\nCurrent:\n${db.texts[textKey]}\n\nSend new text:`,
      cancelKeyboard(CB.ADMIN_TEXTS));
  }

  // ── Payment ──
  if (data === CB.ADMIN_PAYMENT) {
    return sendOrEdit(chatId, msgId,
      `💳 *Payment Info*\n\nCard: \`${db.payment.card}\`\nOwner: \`${db.payment.owner}\`\n\nSelect field:`,
      kb([btn("💳 Card", "admin_payfield_card"), btn("👤 Owner", "admin_payfield_owner")],
         [btn("◀️ Back", CB.ADMIN_PANEL)]));
  }
  if (data.startsWith("admin_payfield_")) {
    const field = data.slice(15);
    setStep(userId, "await_payment_field", { field });
    return sendOrEdit(chatId, msgId, `Enter new *${field}*:`, cancelKeyboard(CB.ADMIN_PAYMENT));
  }

  // ── Orders ──
  if (data === CB.ADMIN_ORDERS || data.startsWith("admin_orders_")) {
    let filter = "pending", page = 0;
    if (data.startsWith("admin_orders_")) {
      const parts = data.split("_");
      filter = parts[2];
      page   = parseInt(parts[3] || "0", 10);
    }
    const total = Object.values(db.orders).filter(o => filter === "all" ? true : o.status === filter).length;
    return sendOrEdit(chatId, msgId,
      `🧾 *Orders* — Filter: ${filter} (${total})`,
      ordersKeyboard(filter, page));
  }

  if (data.startsWith("admin_order_")) {
    const orderId = data.slice(12);
    const o = db.orders[orderId];
    if (!o) return bot.sendMessage(chatId, "❌ Order not found.");
    const p = getProduct(o.productId);
    const u = db.users[String(o.userId)];
    const text = [
      `🧾 *Order Details*`,
      ``,
      `🆔 ID: \`${o.id}\``,
      `📦 Product: ${p ? p.name : o.productId}`,
      `👤 User: ${u ? (u.username || u.firstName || o.userId) : o.userId} (${o.userId})`,
      `💰 Amount: ${o.amount}`,
      `📅 Date: ${new Date(o.createdAt).toLocaleString()}`,
      `🔖 Status: *${o.status}*`
    ].join("\n");
    const btns = o.status === "pending"
      ? kb([btn("✅ Approve", `approve_${o.id}`), btn("❌ Reject", `reject_${o.id}`)],
           [btn("◀️ Back", CB.ADMIN_ORDERS)])
      : kb([btn("◀️ Back", CB.ADMIN_ORDERS)]);
    return sendOrEdit(chatId, msgId, text, btns);
  }

  // ── Users ──
  if (data === CB.ADMIN_USERS) {
    const users = Object.values(db.users).sort((a, b) => b.joinedAt - a.joinedAt);
    const lines = users.slice(0, 20).map(u =>
      `• ${u.username ? "@" + u.username : u.firstName || "User"} | 🛒${u.purchases} | 💰${u.totalSpending || 0}`
    );
    const text = [
      `👥 *Users* (${users.length} total)`,
      ``,
      ...lines,
      users.length > 20 ? `\n...and ${users.length - 20} more` : ""
    ].join("\n");
    return sendOrEdit(chatId, msgId, text,
      kb([btn("◀️ Back", CB.ADMIN_PANEL)]));
  }

  // ── Affiliates ──
  if (data === CB.ADMIN_AFFILIATES) {
    return sendOrEdit(chatId, msgId, "🤝 *Affiliates*", affiliatesKeyboard());
  }

  if (data === "admin_add_affiliate") {
    setStep(userId, "await_affiliate_create", {});
    return sendOrEdit(chatId, msgId,
      "🤝 Enter affiliate name and commission:\n\nFormat: `Name CommissionPct`\nExample: `JohnDoe 15`",
      cancelKeyboard(CB.ADMIN_AFFILIATES));
  }

  if (data.startsWith("admin_aff_leaderboard")) {
    const sorted = Object.values(db.affiliates)
      .sort((a, b) => (b.commissionEarned || 0) - (a.commissionEarned || 0));
    const text = [
      `🏆 *Affiliate Leaderboard*`,
      ``,
      ...sorted.map((a, i) =>
        `${i + 1}. *${a.name}* — ${a.approvedSales || 0} sales / ${(a.commissionEarned || 0).toFixed(2)} earned`)
    ].join("\n");
    return sendOrEdit(chatId, msgId, text,
      kb([btn("◀️ Back", CB.ADMIN_AFFILIATES)]));
  }

  if (data.startsWith("admin_aff_") && !data.startsWith("admin_aff_leaderboard") && !data.startsWith("admin_affpf_")) {
    const code = data.slice(10);
    const aff  = db.affiliates[code];
    if (!aff) return;
    const botInfo = await bot.getMe().catch(() => ({ username: "yourbot" }));
    const link    = `https://t.me/${botInfo.username}?start=${code}`;
    const text = [
      `🤝 *Affiliate: ${aff.name}*`,
      ``,
      `Code: \`${code}\``,
      `Link: ${link}`,
      `Commission: ${aff.commissionPct}%`,
      ``,
      `👆 Clicks: ${aff.clicks || 0}`,
      `👥 Users Referred: ${aff.usersReferred || 0}`,
      `🛒 Purchases: ${aff.purchases || 0}`,
      `✅ Approved Sales: ${aff.approvedSales || 0}`,
      `💰 Commission Earned: ${(aff.commissionEarned || 0).toFixed(2)}`
    ].join("\n");
    return sendOrEdit(chatId, msgId, text, affiliateDetailKeyboard(code));
  }

  if (data.startsWith("admin_affpf_")) {
    // admin_affpf_{code}_{field}
    const parts = data.split("_");
    const field = parts[parts.length - 1];
    const code  = parts.slice(2, parts.length - 1).join("_");
    setStep(userId, "await_affiliate_field", { code, field });
    return sendOrEdit(chatId, msgId, `Enter new *${field}*:`, cancelKeyboard(CB.ADMIN_AFFILIATES));
  }

  if (data.startsWith("admin_delete_aff_")) {
    const code = data.slice(17);
    delete db.affiliates[code];
    saveData();
    return sendOrEdit(chatId, msgId, "🗑 Affiliate deleted.", affiliatesKeyboard());
  }

  // ── Backups ──
  if (data === CB.ADMIN_BACKUPS) {
    return sendOrEdit(chatId, msgId,
      `💾 *Backups*\n\nAvailable: ${listBackups().length}\nTap to restore, or create new.`,
      backupsKeyboard());
  }

  if (data === "admin_backup_now") {
    const file = createBackup();
    return sendOrEdit(chatId, msgId,
      file ? `✅ Backup created:\n\`${path.basename(file)}\`` : "❌ Backup failed.",
      backupsKeyboard());
  }

  if (data.startsWith("admin_restore_") && !data.startsWith("admin_restore_product_")) {
    const filename = data.slice(14);
    const ok = restoreBackup(filename);
    return sendOrEdit(chatId, msgId,
      ok ? `✅ Restored from *${filename.slice(7, 26)}*` : "❌ Restore failed.",
      kb([btn("◀️ Back", CB.ADMIN_BACKUPS)]));
  }

  // ── Admin search ──
  if (data === CB.ADMIN_SEARCH) {
    setStep(userId, "await_user_search", { searchType: "all" });
    return sendOrEdit(chatId, msgId,
      "🔍 Enter search query (searches products, orders, and users):",
      cancelKeyboard(CB.ADMIN_PANEL));
  }
});

// ═══════════════════════════════════════════════════════════════
//  ERROR HANDLING
// ═══════════════════════════════════════════════════════════════
bot.on("polling_error", (err) => { console.error("Polling error:", err.message); });
bot.on("error",         (err) => { console.error("Bot error:",     err.message); });

process.on("uncaughtException",  (err)    => { console.error("Uncaught exception:", err); });
process.on("unhandledRejection", (reason) => { console.error("Unhandled rejection:", reason); });

// ═══════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════
createBackup();
console.log(`🤖 Bot started. Admin ID: ${ADMIN_ID}`);
