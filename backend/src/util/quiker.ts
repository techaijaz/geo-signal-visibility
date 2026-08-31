import os from 'os'
import config from '../config/config'
import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { getTimezonesForCountry } from 'countries-and-timezones'
import bcrypt from 'bcrypt'
import { v4 } from 'uuid'
import { randomInt } from 'crypto'
import jwt from 'jsonwebtoken'
import dayjs from 'dayjs'

export default {
    getSystemHealth: () => {
        return {
            cpuUsage: os.loadavg(),
            totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB ${(((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2)} %`,
            freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            usedMemory: `${((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2)} GB`
        }
    },
    getApplicationHealth: () => {
        return {
            enviornment: config.ENV,
            uptime: `${process.uptime().toFixed(2)} seconds`,
            memoryUsage: {
                heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
                heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
            }
        }
    },
    parsePhoneNumber: (
        phoneNumber: string
    ): { countryCode: string; isoCode: string; internationalNumber: string } => {
        try {
            const parsedPhoneNumber = parsePhoneNumberWithError(phoneNumber)
            if (parsedPhoneNumber && parsedPhoneNumber.countryCallingCode && parsedPhoneNumber.country) {
                return {
                    countryCode: String(parsedPhoneNumber.countryCallingCode),
                    isoCode: String(parsedPhoneNumber.country),
                    internationalNumber: String(parsedPhoneNumber.formatInternational())
                }
            }
            return {
                countryCode: '91',
                isoCode: 'IN',
                internationalNumber: phoneNumber
            }
        } catch (error) {
            return {
                countryCode: '91',
                isoCode: 'IN',
                internationalNumber: phoneNumber
            }
        }
    },
    countryTimezone: (isoCode: string) => {
        return getTimezonesForCountry(isoCode)
    },
    hashedPassword: (password: string) => {
        return bcrypt.hash(password, 10)
    },
    comparePassword: (password: string, hashedPassword: string) => {
        return bcrypt.compare(password, hashedPassword)
    },
    generateRandumId: () => v4(),
    generateOtp: (length: number) => {
        const min = Math.pow(10, length - 1)
        const max = Math.pow(10, length) - 1
        return randomInt(min, max).toString()
    },
    genrateToken: (payload: object, secret: string, expiry: number) => {
        return jwt.sign(payload, secret, { expiresIn: expiry })
    },
    verifyToken: (token: string, secret: string) => {
        return jwt.verify(token, secret)
    },
    getDomainFromUrl: (requesturl: string) => {
        try {
            const url = new URL(requesturl, config.SERVER_URL)
            return url.hostname
        } catch (error) {
            throw error
        }
    },
    generateResetPasswordExpiry: (minute: number) => {
        return dayjs().valueOf() + minute * 60 * 1000
    }
}
