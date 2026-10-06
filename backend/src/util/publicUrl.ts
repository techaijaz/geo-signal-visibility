import axios from 'axios'
import dns from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'

// A brand's website is typed in by the user, so the server must never open an address
// inside our own network (loopback, Docker, the cloud metadata IP) on their behalf
const blocked = new net.BlockList()
for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 3]
] as const) {
    blocked.addSubnet(address, prefix, 'ipv4')
}
for (const [address, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8]
] as const) {
    blocked.addSubnet(address, prefix, 'ipv6')
}

export const isBlockedIp = (ip: string): boolean => {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
    if (mapped) return blocked.check(mapped[1], 'ipv4')
    const family = net.isIP(ip)
    if (family === 4) return blocked.check(ip, 'ipv4')
    if (family === 6) return blocked.check(ip, 'ipv6')
    return true
}

const NOT_PUBLIC = 'Only public websites can be checked'

export const assertPublicUrl = async (url: string): Promise<void> => {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        throw new Error(NOT_PUBLIC)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(NOT_PUBLIC)
    const host = parsed.hostname.replace(/^\[|\]$/g, '')
    const addresses = net.isIP(host) ? [host] : (await dns.promises.lookup(host, { all: true })).map((a) => a.address)
    if (!addresses.length || addresses.some(isBlockedIp)) throw new Error(NOT_PUBLIC)
}

// Checks the address again at connect time, so a name that resolves differently on the
// second lookup still can't reach an internal address
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 4)
        const list = addresses as dns.LookupAddress[]
        if (!list.length || list.some((a) => isBlockedIp(a.address))) return callback(new Error(NOT_PUBLIC), '', 4)
        if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
        callback(null, list[0].address, list[0].family)
    })
}
const httpAgent = new http.Agent({ lookup: safeLookup })
const httpsAgent = new https.Agent({ lookup: safeLookup })

// GET a public page as text, checking every redirect hop
export const fetchPublicText = async (url: string, headers: Record<string, string>, timeout = 10000): Promise<string> => {
    let current = url
    for (let hop = 0; hop <= 5; hop++) {
        await assertPublicUrl(current)
        const res = await axios.get<string>(current, {
            timeout,
            responseType: 'text',
            headers,
            maxRedirects: 0,
            validateStatus: (s) => s >= 200 && s < 400,
            httpAgent,
            httpsAgent
        })
        const location = res.status >= 300 ? (res.headers.location as string | undefined) : undefined
        if (!location) return res.data
        current = new URL(location, current).href
    }
    throw new Error('Too many redirects')
}

// Puppeteer: a cached per-host check for every request the page makes
export const publicRequestFilter = () => {
    const hosts = new Map<string, Promise<boolean>>()
    return (url: string): Promise<boolean> => {
        let parsed: URL
        try {
            parsed = new URL(url)
        } catch {
            return Promise.resolve(false)
        }
        if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return Promise.resolve(true)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return Promise.resolve(false)
        const key = `${parsed.protocol}//${parsed.host}`
        if (!hosts.has(key)) {
            hosts.set(
                key,
                assertPublicUrl(url).then(
                    () => true,
                    () => false
                )
            )
        }
        return hosts.get(key)!
    }
}
