# 🚀 GEO SaaS Application - Visual Deployment Guide

Yeh deployment architecture diagram aapke `docker-compose.yml` aur `nginx.conf` ke poore flow ko visual form mein samjhata hai.

![GEO Deployment Architecture Graph](file:///C:/Users/LT/.gemini/antigravity-ide/brain/ef52e6f6-d646-4cbe-947d-d687ebb3b09e/geo_deployment_architecture_1788178667600.jpg)

---

## 🏬 Aasaan Bhasha Mein Flow (Real Life Analogy)

Isse ek **Restaurant System** ki tarah samjho:

```
[ Customer (User Browser) ]
           │
           ▼
[ Gate Guard / Reception (NGINX Proxy - Port 80) ]
     │                              │
     ├─► UI Maanga? ───────────────► [ Dining Hall / Menu (Frontend React SPA) ]
     │
     └─► Data / Order Diya? ──────► [ Front Desk Manager (Backend Express API) ]
                                            │
                                            ├─► Customer Info Check? ──► [ DB Locker (MongoDB) ]
                                            │
                                            └─► Heavy Cooking Task? ───► [ Token System (Redis Queue) ]
                                                                                  │
                                                                                  ▼
                                                                        [ Kitchen Chefs (BullMQ Workers) ]
                                                                                  │
                                                                                  ▼
                                                                        [ External Vendors (OpenAI, Gemini, Claude) ]
```

---

## 🔍 Step-by-Step Component Visualization

### 1️⃣ Nginx Proxy (`geo_nginx_proxy`) - *Traffic Controller*
* **Role**: Gateway Guard
* **Ports**: `80` (HTTP) & `443` (HTTPS)
* **Kaam**: 
  - Jab user browser open karta hai, sabse pehle Nginx ke paas request aati hai.
  - Agar request normal page open karne ki hai (`/`), toh yeh request **Frontend Container** par bhejta hai.
  - Agar request data, login, ya scan ki hai (`/api/*`), toh yeh request **Backend API Container** par bhejta hai.

### 2️⃣ Frontend Container (`geo_frontend`) - *User Interface*
* **Role**: React SPA (Vite App)
* **Kaam**:
  - Buttons, Tables, Charts aur User Dashboard dikhata hai.
  - Express API se connect karke live data render karta hai.

### 3️⃣ Backend API Container (`geo_backend_api`) - *Manager / Controller*
* **Role**: Node.js Express REST API (Port 8080)
* **Kaam**:
  - Authentication (JWT), User Profiles, Billing (Stripe), Audit Requests handle karta hai.
  - Fast response dene ke liye heavy tasks ko khud calculate **NAHI** karta, balki **Redis Queue** me daal deta hai.

### 4️⃣ Redis Container (`geo_redis`) - *Token Queue (BullMQ)*
* **Role**: In-Memory Data Store & Queue Broker (Port 6379)
* **Kaam**:
  - Jab user "Start Brand Scan" par click karta hai, API ek task order (Job) bana kar Redis queue me rakh deti hai.
  - Isse API hang nahi hoti aur user ko instant response mil jata hai.

### 5️⃣ Async Worker Pool (`geo_backend_worker`) - *Background Chefs*
* **Role**: Background Task Runner (BullMQ Worker)
* **Kaam**:
  - Redis queue se ek-ek karke heavy jobs nikalta hai.
  - OpenAI (GPT-4o), Google Gemini, aur Anthropic Claude APIs ko call karta hai.
  - AI analysis complete karke result **MongoDB Database** me save kar deta hai.

### 6️⃣ Data & AI Layer (`MongoDB` + `AI APIs`)
* **MongoDB**: Safe permanent storage for Users, Audits, History, Subscriptions.
* **AI APIs**: External LLM services jo GEO brand visibility matrix aur scores analyze karti hain.

---

## 🛠️ Docker Network (`geo_network`)

Tamam containers (`nginx`, `frontend`, `api`, `redis`, `worker`) ek hi private internal Docker bridge network **`geo_network`** par connect hain:
- Outside world se sirf **Nginx (Port 80/443)** exposed hai.
- API, Redis aur Workers private security boundary me safe rehte hain.
