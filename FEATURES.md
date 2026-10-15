# Signal AI — Features

*Updated: 16 Oct 2026. Live = production pe chal raha hai. Roadmap ki details aur "kyun": `COMPETITIVE-FEATURES.md`.*

Signal AI Indian D2C / Shopify brands ko dikhata hai ki ChatGPT, Gemini, Claude, Grok, DeepSeek aur Perplexity unke customers ke sawaalon pe kis brand ka naam lete hain, aur use theek karne ke kaam batata hai.

---

## ✅ Abhi product me (live)

### 1. AI visibility tracking
- **AI engines:** ChatGPT, Gemini, Claude, Grok, DeepSeek, Perplexity. Plan ke hisaab se: Free me 3, Starter/Growth me 5, Agency me 6.
- **Auto scans:** Free har hafte, Starter roz, Growth har 8 ghante, Agency har 12 ghante. Manual "Re-scan now" bhi (Free 0, Starter 1, Growth 3, Agency 10 per din per brand).
- **Mentions page:** har sawaal × har AI: naam aaya ya nahi, position, sentiment, kab check hua. AI filter sirf plan ke engines dikhata hai. *(Row khol ke AI ka poora jawab padhna: staging pe, prod me agla release)*
- **Overview:** visibility score, trend chart, kis AI pe kaisa, scan fail ya koi AI chup ho to saaf chetavni.
- **AI answer cache:** wahi sawaal 6 ghante ke andar dobara poochha jaaye to purana jawab (kharcha bachta hai).

### 2. Asli Indian buyer queries
- Har category ke liye suggested sawaal: Hinglish, budget ("500 ke andar sabse accha attar") aur occasion ("shaadi ke liye perfume").
- **Suggest with AI** (din me 10 baar), apne sawaal likho (Hinglish ho to HI-EN tag apne aap).
- Chhoti category (jaise "Scented Candles") ko pehle uske apne sawaal.

### 3. Competitors
- **Lost-to list:** "AI aapki jagah kise recommend kar raha hai": top brands, kitne jawabon me, average position, ek click me Track. Ek brand ki alag spellings ek row, dukaanein (Nykaa, Amazon) list me nahi.
- Tracked competitors, share of voice bar, head-to-head table, har sawaal ka hisaab.
- **Where AI reads (citations):** har Sunday Gemini + Google Search se kaunse pages AI padhta hai; **outreach list**: pages jin pe competitor hain par aap nahi. Overview pe "Top outreach targets", Monday email me ek line.

### 4. Products (D2C ke liye)
- **Shopify se products import** (public catalogue), AI se chhota naam, aliases, haath se add, price edit. Limit: Free 3, Starter 10, Growth 25, Agency 50.
- **Product-level visibility:** har product kitne AI jawabon me aaya, best position, kaunse AI, pichhle scan se farak. "Add top product questions".
- **Product feed health:** ChatGPT Shopping ke rules pe har product ka 0–100 score (description, title, brand, images, price, stock, category), top gaps aur fix.

### 5. Website audit
- Homepage + product pages: SSL, robots.txt me AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot…), llms.txt, schema (Organization, FAQPage, Product, AggregateRating).
- **Store audit:** har product page ka AI-readiness score (schema, price, reviews, description, FAQ, alt text, title/meta) + collection pages.
- **AI crawler view:** product page AI ko (bina JavaScript) kaisa dikhta hai vs shopper ko, side-by-side, "AI sees 3 of 5 facts".
- Andar ke address (localhost, 127.0.0.1 wale naam) save aur fetch dono me mana.

### 6. Recommendations aur fixes
- Audit aur scan ke hisaab se kaam ki list (jo audit me pehle se theek hai woh nahi aata), done mark karo.
- **Generate fix (Fixes page):** brand ke asli pages padh ke FAQ (product kind ya poora brand) aur "Brand vs Competitor" page, English / Hinglish / हिंदी. Har jawab ka source, warna [confirm] me. Copy text / HTML / FAQ schema. Mahine ki limit: Free 1, Starter 10, Growth 30, Agency 150.
- **Kaam ka asar (before/after):** recommendation done karne ke 14 din pehle vs 7–30 din baad ki visibility.

### 7. Reports aur emails
- PDF report (us waqt ka snapshot), report share karna.
- **Monday email:** hafte ka score, kya badla, top outreach target, kaam ka asar; unsubscribe link.
- Account emails: signup confirm, password reset, invoice.

### 8. Free AI visibility checker (website, lead magnet)
- Bina signup: site URL → brand aur category apne aap → 3 sawaal → ChatGPT + Gemini → "6 me se X jawabon me naam aaya".
- Email code ke baad asli competitor naam + report email, signup aur onboarding pehle se bhare.
- Turnstile captcha, IP aur email limits, roz ka budget (admin badal sakta hai), admin me leads + CSV + 7 din ka funnel.

### 9. Billing (India-first)
- Plans: Free ₹0, Starter ₹2,999, Growth ₹9,999, Agency ₹19,999 (mahina), saalana me 2 mahine free.
- Razorpay (UPI, card), ek payment = ek plan = ek invoice (double click, do tab, webhook sab safe). Invoice number financial year se, PDF download aur email. GST abhi nahi lagta.
- Paid plan chalte waqt chhota plan nahi; "Paid until <date>".
- ⚠️ Prod pe abhi Razorpay **test keys** hain (KYC baaki). Live keys ke bina asli paisa nahi aata.

### 10. Account, workspace, admin
- Signup/login, password reset, profile, multi-brand (Free/Starter 1, Growth 3, Agency 25), brand settings, onboarding.
- **Admin portal:** users aur plans, billing aur seller details, AI models (price per 1k tokens, on/off), API keys (encrypted), categories, free checker, cost logs (har AI call: purpose, model, tokens in/out, Google Search grounding fee, pages me).
- **Infra:** staging + production ek VPS pe, GitHub Actions se images aur deploy (rollback ke saath), har deploy se pehle Mongo backup.

---

## 🔜 Aage aane wale (roadmap)

| # | Feature | Kya hoga | Mehnat |
|---|---|---|---|
| 6 | **Shopify app (OAuth)** | "Connect Shopify" se products, collections, reviews apne aap; theme extension se FAQ/Product schema aur llms.txt seedha store me ek click me. Shopify App Store pe listing. | Bada (3+ hafte) |
| 10 | **AI se aaya traffic aur orders** | Shopify/GA4 se chatgpt.com, perplexity.ai, gemini se aaye visits aur orders: "AI se ₹48,000 ke orders aaye". | 1–2 hafte |
| 8 | **Marketplace presence** | Amazon.in, Flipkart, Nykaa, Myntra, Meesho pe brand hai ya nahi, rating, aur site se link hai ya nahi. | 1–2 hafte |
| 11 | **WhatsApp report aur alerts** | Hafte ka score WhatsApp pe; alert "is hafte ChatGPT ne aapki jagah Adil Qadri ko recommend kiya". (Plan me flag hai, feature nahi bana.) | 1–3 din / 1 hafta |
| 12 | **AI galat jaankari alert** | AI galat price, "alcohol hai" ya band product bataye to alert aur sahi karne ke steps. | 1–2 hafte |
| 15 | **Agency mode (white-label)** | Agency ke logo wali PDF, client-wise workspaces, bulk pricing. (Agency plan hai, white-label flag hai, feature nahi bana.) | 1–2 hafte |
| — | **Generate fix: llms.txt** | Brand ke data se llms.txt ka draft (FAQ aur comparison ban chuke hain). | Chhota |

### Chhote kaam jo baaki hain
- Razorpay live keys + live webhook secret (KYC ke baad).

### Jaan-boojh ke nahi banayenge
20+ AI engines, enterprise SSO/SOC 2, har ghante scan, har desh ka support, apna AI model. (Wajah: `COMPETITIVE-FEATURES.md` section 5.)
