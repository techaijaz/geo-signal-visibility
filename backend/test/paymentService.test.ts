import crypto from 'crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { query } from './helpers'

const mocks = vi.hoisted(() => ({
    config: {
        ALLOW_MOCK_PAYMENTS: false,
        PAYMENT: {
            RAZORPAY_KEY_ID: 'rzp_test_key',
            RAZORPAY_KEY_SECRET: 'rzp_test_secret',
            STRIPE_SECRET_KEY: 'sk_test',
            STRIPE_PUBLISHABLE_KEY: 'pk_test'
        }
    },
    razorpayOrdersFetch: vi.fn(),
    stripeRetrieve: vi.fn()
}))

vi.mock('../src/config/config', () => ({ default: mocks.config }))
vi.mock('razorpay', () => ({
    default: class {
        orders = { fetch: mocks.razorpayOrdersFetch, create: vi.fn() }
    }
}))
vi.mock('stripe', () => ({
    default: class {
        paymentIntents = { retrieve: mocks.stripeRetrieve, create: vi.fn() }
    }
}))

import orgModel from '../src/model/orgModel'
import { InvoiceModel, SubscriptionModel } from '../src/model/billingModel'
import { PaymentError, paymentService } from '../src/service/paymentService'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-01T12:00:00Z')
const userId = new Types.ObjectId().toString()
const orgId = new Types.ObjectId().toString()

const sign = (orderId: string, paymentId: string, secret = 'rzp_test_secret') =>
    crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')

const razorpayConfirm = (overrides: object = {}) => ({
    userId,
    orgId,
    plan: 'growth' as const,
    billingCycle: 'monthly' as const,
    gateway: 'razorpay' as const,
    gatewayOrderId: 'order_1',
    gatewayPaymentId: 'pay_1',
    gatewaySignature: sign('order_1', 'pay_1'),
    ...overrides
})

describe('paymentService.confirmPayment', () => {
    let orgUpdate: ReturnType<typeof vi.spyOn>
    let subUpsert: ReturnType<typeof vi.spyOn>
    let invoiceCreate: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW })
        mocks.config.ALLOW_MOCK_PAYMENTS = false
        mocks.razorpayOrdersFetch.mockReset()
        mocks.stripeRetrieve.mockReset()
        mocks.razorpayOrdersFetch.mockResolvedValue({
            amount: 999900,
            notes: { plan: 'growth', billingCycle: 'monthly', orgId }
        })
        vi.spyOn(InvoiceModel, 'exists').mockResolvedValue(null)
        vi.spyOn(InvoiceModel, 'countDocuments').mockResolvedValue(4 as never)
        vi.spyOn(SubscriptionModel, 'findOne').mockReturnValue(query(null) as never)
        orgUpdate = vi.spyOn(orgModel, 'findByIdAndUpdate').mockResolvedValue({} as never)
        subUpsert = vi
            .spyOn(SubscriptionModel, 'findOneAndUpdate')
            .mockImplementation(((_f: unknown, update: unknown) => Promise.resolve(update)) as never)
        invoiceCreate = vi.spyOn(InvoiceModel, 'create').mockImplementation(((doc: unknown) => Promise.resolve(doc)) as never)
        return () => vi.useRealTimers()
    })

    describe('Razorpay', () => {
        it('activates the plan for 30 days and invoices the amount Razorpay charged', async () => {
            const { invoice } = await paymentService.confirmPayment(razorpayConfirm())

            expect(orgUpdate).toHaveBeenCalledWith(orgId, { plan: 'growth' })
            expect(subUpsert).toHaveBeenCalledWith(
                { orgId },
                expect.objectContaining({
                    plan: 'growth',
                    status: 'active',
                    currentPeriodStart: NOW,
                    expiresAt: new Date(NOW.getTime() + 30 * DAY)
                }),
                { upsert: true, new: true }
            )
            expect(invoice).toMatchObject({
                invoiceNumber: 'INV-2026-1005',
                amount: 9999,
                paymentMethod: 'Razorpay',
                gatewayPaymentId: 'pay_1'
            })
        })

        it('rejects a forged signature without activating anything', async () => {
            const forged = razorpayConfirm({ gatewaySignature: sign('order_1', 'pay_1', 'wrong_secret') })

            await expect(paymentService.confirmPayment(forged)).rejects.toBeInstanceOf(PaymentError)
            expect(mocks.razorpayOrdersFetch).not.toHaveBeenCalled()
            expect(orgUpdate).not.toHaveBeenCalled()
        })

        it('rejects a cheaper order replayed against a pricier plan', async () => {
            mocks.razorpayOrdersFetch.mockResolvedValue({
                amount: 299900,
                notes: { plan: 'starter', billingCycle: 'monthly', orgId }
            })

            await expect(paymentService.confirmPayment(razorpayConfirm())).rejects.toThrow('Payment does not match the selected plan')
            expect(orgUpdate).not.toHaveBeenCalled()
        })

        it('rejects an order made for another org', async () => {
            mocks.razorpayOrdersFetch.mockResolvedValue({
                amount: 999900,
                notes: { plan: 'growth', billingCycle: 'monthly', orgId: new Types.ObjectId().toString() }
            })

            await expect(paymentService.confirmPayment(razorpayConfirm())).rejects.toBeInstanceOf(PaymentError)
        })

        it('rejects a payment that was already used', async () => {
            vi.mocked(InvoiceModel.exists).mockResolvedValue({ _id: new Types.ObjectId() } as never)

            await expect(paymentService.confirmPayment(razorpayConfirm())).rejects.toThrow('This payment has already been used')
            expect(InvoiceModel.exists).toHaveBeenCalledWith({ gatewayPaymentId: 'pay_1' })
            expect(orgUpdate).not.toHaveBeenCalled()
        })
    })

    describe('Stripe', () => {
        const stripeConfirm = { userId, orgId, plan: 'starter' as const, gateway: 'stripe' as const, gatewayOrderId: 'pi_1' }

        it('activates the plan once the PaymentIntent succeeded', async () => {
            mocks.stripeRetrieve.mockResolvedValue({
                status: 'succeeded',
                amount: 299900,
                metadata: { plan: 'starter', billingCycle: 'monthly', orgId }
            })

            const { invoice } = await paymentService.confirmPayment(stripeConfirm)

            expect(mocks.stripeRetrieve).toHaveBeenCalledWith('pi_1')
            expect(invoice).toMatchObject({ amount: 2999, paymentMethod: 'Stripe Card', gatewayPaymentId: 'pi_1' })
        })

        it('rejects a PaymentIntent that has not succeeded', async () => {
            mocks.stripeRetrieve.mockResolvedValue({ status: 'requires_payment_method', amount: 299900, metadata: {} })

            await expect(paymentService.confirmPayment(stripeConfirm)).rejects.toThrow(
                'Stripe payment not succeeded (status: requires_payment_method)'
            )
            expect(orgUpdate).not.toHaveBeenCalled()
        })
    })

    describe('renewals', () => {
        it('extends an active same-plan subscription from its current expiry', async () => {
            const expiresAt = new Date(NOW.getTime() + 10 * DAY)
            vi.mocked(SubscriptionModel.findOne).mockReturnValue(query({ plan: 'growth', status: 'active', expiresAt }) as never)

            await paymentService.confirmPayment(razorpayConfirm())

            expect(subUpsert).toHaveBeenCalledWith(
                { orgId },
                expect.objectContaining({ currentPeriodStart: expiresAt, expiresAt: new Date(expiresAt.getTime() + 30 * DAY) }),
                expect.anything()
            )
        })

        it('starts a plan change from now rather than stacking on the old plan', async () => {
            vi.mocked(SubscriptionModel.findOne).mockReturnValue(
                query({ plan: 'starter', status: 'active', expiresAt: new Date(NOW.getTime() + 10 * DAY) }) as never
            )

            await paymentService.confirmPayment(razorpayConfirm())

            expect(subUpsert).toHaveBeenCalledWith({ orgId }, expect.objectContaining({ currentPeriodStart: NOW }), expect.anything())
        })

        it('gives a yearly plan 365 days', async () => {
            mocks.razorpayOrdersFetch.mockResolvedValue({
                amount: 9999000,
                notes: { plan: 'growth', billingCycle: 'yearly', orgId }
            })

            await paymentService.confirmPayment(razorpayConfirm({ billingCycle: 'yearly' }))

            expect(subUpsert).toHaveBeenCalledWith(
                { orgId },
                expect.objectContaining({ expiresAt: new Date(NOW.getTime() + 365 * DAY) }),
                expect.anything()
            )
        })
    })

    describe('sandbox gateway', () => {
        it('is refused unless mock payments are enabled', async () => {
            await expect(paymentService.confirmPayment({ userId, orgId, plan: 'growth', gateway: 'mock' })).rejects.toThrow(
                'Unsupported payment gateway: mock'
            )
            expect(orgUpdate).not.toHaveBeenCalled()
        })

        it('charges the list price when enabled', async () => {
            mocks.config.ALLOW_MOCK_PAYMENTS = true

            await paymentService.confirmPayment({ userId, orgId, plan: 'growth', gateway: 'mock' })

            expect(invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 9999, paymentMethod: 'Sandbox' }))
        })
    })
})

describe('paymentService.expireLapsedSubscriptions', () => {
    it('moves lapsed paid orgs to free and leaves a just-renewed one alone', async () => {
        const lapsed = { _id: new Types.ObjectId(), orgId: new Types.ObjectId(), plan: 'growth', expiresAt: new Date(NOW.getTime() - 1) }
        const renewed = { _id: new Types.ObjectId(), orgId: new Types.ObjectId(), plan: 'starter', expiresAt: new Date(NOW.getTime() - 1) }
        const find = vi.spyOn(SubscriptionModel, 'find').mockReturnValue(query([lapsed, renewed]) as never)
        // The renewal landed between the find and the update, so the guarded update matches nothing
        const updateOne = vi
            .spyOn(SubscriptionModel, 'updateOne')
            .mockResolvedValueOnce({ modifiedCount: 1 } as never)
            .mockResolvedValueOnce({ modifiedCount: 0 } as never)
        const orgUpdate = vi.spyOn(orgModel, 'findByIdAndUpdate').mockResolvedValue({} as never)

        await paymentService.expireLapsedSubscriptions(NOW)

        expect(find).toHaveBeenCalledWith({ expiresAt: { $lte: NOW }, plan: { $ne: 'free' } })
        expect(updateOne).toHaveBeenCalledWith(
            { _id: lapsed._id, expiresAt: lapsed.expiresAt },
            { $set: { plan: 'free', status: 'expired', expiresAt: null } }
        )
        expect(orgUpdate).toHaveBeenCalledTimes(1)
        expect(orgUpdate).toHaveBeenCalledWith(lapsed.orgId, { plan: 'free' })
    })
})
