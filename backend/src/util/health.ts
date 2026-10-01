// Liveness / readiness checks shared by the API and the worker (Docker healthchecks, Kubernetes probes).
//   /healthz  liveness: the process is up and its event loop answers. Failing it means "restart me".
//   /readyz   readiness: MongoDB and Redis answer. Failing it means "don't send me traffic yet".
import http from 'http'
import mongoose from 'mongoose'
import IORedis from 'ioredis'
import { connection } from '../service/queueService'

const withTimeout = <T>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

// One small client just for pings, created on first use
let redisClient: IORedis | null = null
const getRedis = () => {
    if (!redisClient) {
        redisClient = new IORedis({ ...connection, lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })
        redisClient.on('error', () => undefined) // reported through readiness, not as crashes
    }
    return redisClient
}

export const readinessCheck = async () => {
    const mongo = mongoose.connection.readyState === 1
    let redis = false
    try {
        const client = getRedis()
        if (client.status === 'wait' || client.status === 'end') await withTimeout(client.connect(), 2000)
        redis = (await withTimeout(client.ping(), 2000)) === 'PONG'
    } catch {
        redis = false
    }
    return { ok: mongo && redis, mongo: mongo ? 'up' : 'down', redis: redis ? 'up' : 'down' }
}

// Minimal HTTP server for processes without Express (the BullMQ worker)
export const startHealthServer = (port: number) => {
    const server = http.createServer((req, res) => {
        if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}')
            return
        }
        if (req.url === '/readyz') {
            readinessCheck()
                .then((r) => res.writeHead(r.ok ? 200 : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify(r)))
                .catch(() => res.writeHead(503).end())
            return
        }
        res.writeHead(404).end()
    })
    server.listen(port)
    return server
}
