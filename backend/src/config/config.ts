import dotenvFlow from 'dotenv-flow'

dotenvFlow.config()

export default {
    //genral
    ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    SERVER_URL: process.env.SERVER_URL,

    //Database
    DATABASE_URL: process.env.DATABASE_URL,

    //frontend
    FRONTEND_URL: process.env.FRONTEND_URL || process.env.FRUNTEND_URL || 'http://localhost:5173',

    //email service & SMTP
    EMAIL_SERVICE_API_KEY: process.env.EMAIL_SERVICE_API_KEY,
    get SMTP() {
        dotenvFlow.config({ purge_dotenv: true })
        return {
            HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
            PORT: Number(process.env.SMTP_PORT) || 587,
            SECURE: process.env.SMTP_SECURE === 'true',
            USER: process.env.SMTP_USER || '',
            PASS: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
            FROM: process.env.SMTP_FROM || '"Signal AI" <07.aijaz@gmail.com>'
        }
    },

    //ACCESS_TOKEN_SECRET
    ACCESS_TOKEN: {
        SECRET: process.env.ACCESS_TOKEN_SECRET,
        EXPIRY: 3600
    },

    //REFRESH_TOKEN_SECRET
    REFRESH_TOKEN: {
        SECRET: process.env.REFRESH_TOKEN_SECRET,
        EXPIRY: 3600 * 24
    },

    //AI Providers API Keys
    AI_KEYS: {
        DEEPSEEK: process.env.DEEPSEEK_API_KEY || '',
        OPENAI: process.env.OPENAI_API_KEY || '',
        GEMINI: process.env.GEMINI_API_KEY || '',
        ANTHROPIC: process.env.ANTHROPIC_API_KEY || '',
        OMNIROUTE: process.env.OMNIROUTE_API_KEY || ''
    },

    //AI Model Variant Selection
    AI_MODELS: {
        DEEPSEEK: process.env.DEEPSEEK_MODEL_NAME || 'deepseek-v4-flash', // 'deepseek-v4-flash' or 'deepseek-v4-pro'
        GEMINI: process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash',   // 'gemini-1.5-flash' or 'gemini-1.5-pro'
        CLAUDE: process.env.CLAUDE_MODEL_NAME || 'claude-3-5-sonnet-20241022', // 'claude-3-5-sonnet-20241022' or 'claude-3-opus-20240229'
        OPENAI: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',        // 'gpt-4o-mini' or 'gpt-4o'
        OMNIROUTE: process.env.OMNIROUTE_MODEL_NAME || 'omniroute-auto'
    },
    OMNIROUTE_BASE_URL: process.env.OMNIROUTE_BASE_URL || 'https://api.omniroute.ai/v1/chat/completions',

    // Payment Gateway Keys
    PAYMENT: {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
        STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLIC_KEY || '',
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || ''
    }
}
