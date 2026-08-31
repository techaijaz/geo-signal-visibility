# 🚀 Signal AI — Generative Engine Optimization (GEO) & AI Brand Visibility Platform

**Signal AI** is an enterprise-grade **Generative Engine Optimization (GEO)** platform designed to monitor, audit, and boost brand visibility across modern AI search engines and Large Language Models (LLMs) such as **ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google), Perplexity, and DeepSeek**.

Just as traditional SEO helps websites rank on Google search, **Signal AI (GEO)** ensures your brand gets recommended when users ask AI engines questions like *"What is the best software for startups?"* or *"Top rated services in India"*.

---

## 🌟 Key Features & Benefits

### 1. 🤖 Multi-Model AI Visibility Tracking
- **Live AI Querying:** Simulates real user queries across 300+ LLMs using the **OpenRouter Unified Gateway** and native provider APIs.
- **Sentiment & Rank Position Parsing:** Automatically detects whether your brand is mentioned, its rank position in numbered lists/paragraphs, and sentiment (*Positive, Neutral, Negative*).
- **Parallel Scanning Engine:** Powered by high-speed concurrent processing (`Promise.all`), running multi-model queries simultaneously in 3-5 seconds.

### 2. 🕷️ Real Website AI-Compatibility Crawler
- **AI Scraper Access Auditing:** Checks `robots.txt` for explicit permissions for `GPTBot`, `ClaudeBot`, `Google-Extended`, `PerplexityBot`, and `Bytespider`.
- **`llms.txt` Standard Verification:** Validates the presence of machine-readable AI summaries.
- **Schema.org & JSON-LD Validation:** Inspects `Organization`, `Product`, `SoftwareApplication`, `Service`, `FAQPage`, and `Review` structured data.
- **SSL / HTTPS Gate:** Enforces security compliance before running website audits.

### 3. 💡 AI-Powered GEO Recommendations Engine
- **Automated Action Plans:** Generates custom, prioritized recommendations categorized by *Technical*, *Content*, and *Off-site* impact.
- **Code Snippet Generator:** Provides ready-to-use JSON-LD schema snippets and `robots.txt` / `llms.txt` templates directly in the dashboard.

### 4. 🔐 Dynamic Admin Management & Enterprise Security
- **AES-256 Encrypted API Keys Manager:** Dynamically configure API keys (OpenRouter, OpenAI, Gemini, DeepSeek, Anthropic) via the UI with AES-256-CBC at-rest encryption.
- **Dynamic AI Models Manager:** Add, edit, enable, or disable AI models on the fly without changing backend code.
- **Background Queue & Scheduler:** Integrated **BullMQ + Redis** job queue for asynchronous background scans and scheduled weekly reports.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Custom Vanilla CSS Design System (Sleek Dark Theme) |
| **Backend API** | Node.js, Express.js, TypeScript, REST API |
| **Database** | MongoDB (Mongoose ORM) |
| **Queue & Worker** | BullMQ, Redis |
| **LLM Gateway** | OpenRouter API (Passthrough 300+ Models) |
| **Web Crawling** | Cheerio, Axios |
| **Security** | Crypto (AES-256-CBC), JWT (JSON Web Tokens), Bcrypt |
| **Payments** | Stripe & Razorpay SDKs |
| **Email** | Nodemailer (SMTP) |

---

## 📂 Project Architecture

```
GEO/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment & global configs
│   │   ├── controller/      # API Controllers (Admin, Auth, Brand, Audit, etc.)
│   │   ├── middleware/      # JWT Auth & Admin Role validation
│   │   ├── model/           # Mongoose Data Schemas (User, Brand, Mention, Audit, AiModel)
│   │   ├── router/          # Express Routers
│   │   ├── service/         # Business Logic (aiService, auditService, recommendationService)
│   │   ├── util/            # Encryption (AES-256), Logger, Response formatting
│   │   ├── app.ts           # Express Application setup
│   │   ├── server.ts        # HTTP Server listener
│   │   └── worker.ts        # BullMQ Background Worker & Cron Scheduler
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/      # Reusable UI Components
    │   ├── pages/           # Application Views (Overview, Audit, Mentions, Recommendations)
    │   │   └── admin/       # Admin Portal (AdminApiKeys, AdminModels, AdminUsers, etc.)
    │   ├── utils/           # Axios instance & HTTP interceptors
    │   ├── App.tsx          # Router & Navigation setup
    │   └── main.tsx
    ├── package.json
    └── vite.config.ts
```

---

## 🚀 Installation & Setup Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local instance or MongoDB Atlas URI
- **Redis**: Local or cloud instance (optional, required for queue workers)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/techaijaz/geo-signal-visibility.git
cd geo-signal-visibility
```

---

### Step 2: Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create `.env.development` file based on `.env.example`:
   ```bash
   cp .env.example .env.development
   ```

3. Configure environment variables in `.env.development`:
   ```env
   PORT=5000
   ENV=development
   DATABASE_URL=mongodb://localhost:27017/geo-visibility
   FRONTEND_URL=http://localhost:5173

   ACCESS_TOKEN_SECRET=your_jwt_access_secret_key_here
   REFRESH_TOKEN_SECRET=your_jwt_refresh_secret_key_here

   # OpenRouter API Key (Recommended for 300+ models)
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```

4. Start the Backend API server:
   ```bash
   npm run dev
   ```

5. *(Optional)* Start the Background Worker process:
   ```bash
   npm run worker
   ```

---

### Step 3: Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env` file for frontend:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api/v1
   ```

3. Start Vite Development Server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

---

## 💻 How to Use Signal AI

### 1. Account Setup & Brand Registration
- Register a new account or log in to the dashboard.
- Create your workspace and add your brand (e.g., Brand Name, Category, Website URL, Competitors, and Target Queries).

### 2. Run AI Visibility Scan (Pehla Button)
- Go to the **Overview** or **Mentions** tab and click **"Run AI Scan"**.
- Signal AI will query active AI models concurrently via OpenRouter and parse your brand's rank, sentiment, and mention presence.

### 3. Run Website AI Compatibility Audit (Dusra Button)
- Go to the **Website Audit** tab and click **"Audit Website"**.
- The crawler will check your `robots.txt`, `llms.txt`, JSON-LD schemas, and security tags to deliver an overall **AI Health Score (0-100)**.

### 4. Implement Recommendations
- Visit the **Recommendations** tab to review actionable fixes (Technical, Content, Off-site) complete with JSON-LD snippets.

### 5. Admin Portal Management
- Log in as an **Admin** user to access `/admin/api-keys` and `/admin/ai-models`.
- Manage encrypted API keys dynamically and toggle AI models on or off without redeploying code.

---

## 🔒 Security Best Practices

- **AES-256-CBC Encryption:** API secret keys added via the Admin UI are encrypted before storing in MongoDB.
- **Environment Isolation:** Credentials in `.env.development` are ignored by Git.
- **JWT Authentication:** Stateful refresh tokens and short-lived access tokens protect all API endpoints.

---

## 📜 License

This project is proprietary software. All rights reserved.

---

Made with ❤️ for the future of **Generative Engine Optimization (GEO)**.
