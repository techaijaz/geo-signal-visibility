import crypto from 'crypto'
import config from '../config/config'

const ALGORITHM = 'aes-256-cbc'
// Ensure 32-byte key from secret
const SECRET_KEY = crypto.createHash('sha256').update(config.ACCESS_TOKEN.SECRET || 'signal-ai-geo-secret-key-2026').digest()

export function encrypt(text: string): { encryptedData: string; iv: string } {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return {
        encryptedData: encrypted,
        iv: iv.toString('hex')
    }
}

export function decrypt(encryptedData: string, ivHex: string): string {
    try {
        const iv = Buffer.from(ivHex, 'hex')
        const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv)
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
    } catch {
        return ''
    }
}

export function maskApiKey(apiKey: string): string {
    if (!apiKey) return ''
    if (apiKey.length <= 8) return '••••••••'
    const start = apiKey.slice(0, 4)
    const end = apiKey.slice(-4)
    return `${start}••••••••${end}`
}
