import { Connection } from 'mongoose'
import { RateLimiterMongo } from 'rate-limiter-flexible'

export let rateLimiterMongo: null | RateLimiterMongo

const DURATION = 60
// Requests per IP per minute across the API; a dashboard page load makes several calls
const POINTS = Number(process.env.RATE_LIMIT_PER_MINUTE) || 120
export const initRateLimiter = (mongooseConnection: Connection) => {
    rateLimiterMongo = new RateLimiterMongo({
        storeClient: mongooseConnection,
        points: POINTS,
        duration: DURATION
    })
}
