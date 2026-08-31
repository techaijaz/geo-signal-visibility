import { NextFunction, Request, Response } from 'express'
import httpResponse from '../util/httpResponse'
import responceseMessage from '../constent/responceseMessage'
import httpError from '../util/httpError'
import {
    IDecriptedJwt,
    ILoginRequestBody,
    IRegisterRequestBody,
    IUser,
    IForgotPasswordRequestBody,
    IResetPasswordRequestBody,
    IChangePasswordRequestBody,
    IUpdateProfileRequestBody,
    IUserWithId
} from '../types/userTypes'
import {
    validateJoiSchema,
    validationLoginBody,
    validationRegisterBody,
    validationForgotPasswordBody,
    validationResetPasswordBody,
    validationChangePasswordBody,
    validationUpdateProfileBody
} from '../service/validationService'
import quiker from '../util/quiker'
import databseService from '../service/databseService'
import { EUserRole } from '../constent/userConstent'

import emailService from '../service/emailService'
import loger from '../util/loger'
import config from '../config/config'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { EApplicationEnvionment } from '../constent/application'
dayjs.extend(utc)

interface IRegisterRequest extends Request {
    body: IRegisterRequestBody
}

interface IForgotPasswordRequest extends Request {
    body: IForgotPasswordRequestBody
}

interface IResetPasswordRequest extends Request {
    params: { token: string }
    body: IResetPasswordRequestBody
}
interface IChangePasswordRequest extends Request {
    authenticatedUser: IUserWithId
    body: IChangePasswordRequestBody
}
interface IUpdateProfileRequest extends Request {
    authenticatedUser: IUserWithId
    body: IUpdateProfileRequestBody
}
interface ILoginRequest extends Request {
    body: ILoginRequestBody
}

interface IConfirmRequest extends Request {
    prams: {
        token: string
    }
    query: {
        code: string
    }
}

interface ISelfIdentificationRequest extends Request {
    authenticatedUser: IUser
}
export default {
    register: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { body } = req as IRegisterRequest

            // * body validation
            const { error, value } = validateJoiSchema<IRegisterRequestBody>(validationRegisterBody, body)
            if (error) {
                return httpError(next, new Error(error), req, 422)
            }

            // * phone number parsing and validation
            const { name, phone, email, password, consent } = value
            let rawPhone = phone && phone.trim() ? phone.trim() : '+919999999999'
            if (!rawPhone.startsWith('+')) {
                if (/^\d{10}$/.test(rawPhone)) {
                    rawPhone = '+91' + rawPhone
                } else {
                    rawPhone = '+' + rawPhone
                }
            }
            const { countryCode, isoCode, internationalNumber } = quiker.parsePhoneNumber(rawPhone)

            // * Timezone
            const timezoneList = isoCode ? quiker.countryTimezone(isoCode) : null
            const userTimezone = (timezoneList && timezoneList.length > 0) ? timezoneList[0].name : 'Asia/Kolkata'

            // * check if user already exist using
            const user = await databseService.findUserByEmail(email)
            if (user) {
                return httpError(next, new Error(responceseMessage.ALREADY_EXIST('User', email)), req, 422)
            }

            // * encrypt password
            const encryptedPassword = await quiker.hashedPassword(password)
            const token = quiker.generateRandumId()
            const code = quiker.generateOtp(6)

            // * create user
            const payload: IUser = {
                name,
                email,
                phone: {
                    isoCode,
                    countryCode,
                    internationalNumber
                },
                accountConfirmation: {
                    status: false,
                    token,
                    code,
                    timestamp: null
                },
                passwordReset: {
                    token,
                    expiry: null,
                    lastResetAt: null
                },
                refreshToken: {
                    token: null
                },
                lastLoginAt: null,
                role: EUserRole.USER,
                timezone: userTimezone,
                password: encryptedPassword,
                consent
            }
            const newUser = await databseService.registerUser(payload)

            // * send verification email
            const confirmationalURL = `${config.FRONTEND_URL}/confirmation/${token}?code=${code}`
            const to = [email]
            const subject = 'Confirm your account'
            const text = `Hey ${name}, Please confirm your email by clicking on this link: ${confirmationalURL}\n\n`

            emailService.sendEmail(to, subject, text).catch((err) => loger.error('EMAIL_SERVICE', { meta: err }))

            httpResponse(req, res, 201, responceseMessage.SUCCESS, {
                _id: newUser._id,
                email: newUser.email,
                role: newUser.role
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    confirmation: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { params, query } = req as IConfirmRequest
            // * confirm user by token and code
            const user = await databseService.findUserByConfirmationTokenAndCode(params.token, query.code)
            if (!user) {
                return httpError(next, new Error(responceseMessage.INVALID_ACCOUNT_CONFIRMATION_TOKEN_OR_CODE), req, 422)
            }

            //  * account is already confirmed
            if (user.accountConfirmation.status) {
                return httpError(next, new Error(responceseMessage.ACCOUNT_ALREADY_CONFIRMED), req, 422)
            }

            // * confirm user
            user.accountConfirmation.status = true
            user.accountConfirmation.timestamp = dayjs().utc().toDate()
            await user.save()

            // * send confirmation email
            const to = [user.email]
            const subject = 'Account Confirmed'
            const text = `Hey ${user.name}, Your account has been successfully confirmed.\n\n`
            emailService.sendEmail(to, subject, text).catch((error) => loger.error('EMAIL_SERVICE', { meta: error }))
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                email: user.email,
                confirmed: true
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    resendConfirmation: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email } = req.body as { email: string }
            if (!email) {
                return httpError(next, new Error('Email is required.'), req, 422)
            }

            const user = await databseService.findUserByEmail(email)
            if (!user) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }

            if (user.accountConfirmation && user.accountConfirmation.status) {
                return httpError(next, new Error(responceseMessage.ACCOUNT_ALREADY_CONFIRMED), req, 400)
            }

            const token = quiker.generateRandumId()
            const code = quiker.generateOtp(6)

            user.accountConfirmation.token = token
            user.accountConfirmation.code = code
            await user.save()

            const confirmationalURL = `${config.FRONTEND_URL}/confirmation/${token}?code=${code}`
            const to = [email]
            const subject = 'Confirm your account'
            const text = `Hey ${user.name}, Please confirm your email by clicking on this link: ${confirmationalURL}\n\n`

            emailService.sendEmail(to, subject, text).catch((err) => loger.error('EMAIL_SERVICE', { meta: err }))

            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                message: 'Confirmation email sent successfully.'
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    login: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { body } = req as ILoginRequest
            const { error, value } = validateJoiSchema<ILoginRequestBody>(validationLoginBody, body)
            if (error) {
                return httpError(next, error, req, 422)
            }

            const { email, password } = value
            // * finnd user by email
            const user = await databseService.findUserByEmail(email, '+password')
            // * validate password
            if (!user) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }
            const isPasswordMatch = await quiker.comparePassword(password, user.password)
            if (!isPasswordMatch) {
                return httpError(next, new Error(responceseMessage.INVALID_CREDENTIALS), req, 404)
            }
            // * check email confirmation
            if (!user.accountConfirmation || !user.accountConfirmation.status) {
                return httpError(next, new Error('Please confirm your email address to activate your account.'), req, 403)
            }
            // * generate token
            const accessToken = quiker.genrateToken(
                { userId: user._id, role: user.role },
                config.ACCESS_TOKEN.SECRET as string,
                config.ACCESS_TOKEN.EXPIRY
            )

            const refreshToken = quiker.genrateToken(
                { userId: user._id, role: user.role },
                config.REFRESH_TOKEN.SECRET as string,
                config.REFRESH_TOKEN.EXPIRY
            )
            // * last login
            user.lastLoginAt = dayjs().utc().toDate()
            await user.save()
            // * tokens save

            user.refreshToken.token = refreshToken
            await user.save()

            // * cookie send
            const DOMAIN = quiker.getDomainFromUrl(config.SERVER_URL as string)
            const isProduction = config.ENV === EApplicationEnvionment.PRODUCTION

            res.cookie('accessToken', accessToken, {
                path: '/api/v1',
                domain: DOMAIN,
                sameSite: isProduction ? 'strict' : 'lax',
                maxAge: 1000 * config.ACCESS_TOKEN.EXPIRY,
                httpOnly: true,
                secure: isProduction
            }).cookie('refreshToken', refreshToken, {
                path: '/api/v1',
                domain: DOMAIN,
                sameSite: isProduction ? 'strict' : 'lax',
                maxAge: 1000 * config.REFRESH_TOKEN.EXPIRY,
                httpOnly: true,
                secure: isProduction
            })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                accessToken,
                refreshToken,
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    selfIdentification: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { authenticatedUser } = req as ISelfIdentificationRequest
            httpResponse(req, res, 200, responceseMessage.SUCCESS, authenticatedUser)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    logout: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { cookies } = req
            const { refreshToken } = cookies as {
                refreshToken: string | undefined
            }

            if (refreshToken) {
                await databseService.deleteRefreshToken(refreshToken)
            }
            const DOMAIN = quiker.getDomainFromUrl(config.SERVER_URL as string)
            res.clearCookie('accessToken', {
                path: '/api/v1',
                domain: DOMAIN,
                sameSite: 'strict',
                maxAge: 10000 * config.ACCESS_TOKEN.EXPIRY,
                httpOnly: true,
                secure: !(config.ENV === EApplicationEnvionment.PRODUCTION)
            }).clearCookie('refreshToken', {
                path: '/api/v1',
                domain: DOMAIN,
                sameSite: 'strict',
                maxAge: 10000 * config.REFRESH_TOKEN.EXPIRY,
                httpOnly: true,
                secure: !(config.ENV === EApplicationEnvionment.PRODUCTION)
            })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, null)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    refresshToken: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { cookies, body } = req
            const refreshToken = (cookies as { refreshToken?: string })?.refreshToken || (body as { refreshToken?: string })?.refreshToken

            if (!refreshToken) {
                return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
            }

            const rft = await databseService.getRefreshTokan(refreshToken)
            if (!rft) {
                return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
            }

            let userId: string | null = null
            let role: string | null = null
            try {
                const decryptedjwt = quiker.verifyToken(refreshToken, config.REFRESH_TOKEN.SECRET as string) as IDecriptedJwt
                userId = decryptedjwt.userId
                role = decryptedjwt.role || 'user'
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (err) {
                userId = null
            }

            if (!userId) {
                return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
            }

            const user = await databseService.findUserById(userId)
            if (!user) {
                return httpError(next, new Error(responceseMessage.UNAUTHORIZED), req, 401)
            }

            const newAccessToken = quiker.genrateToken(
                { userId: user._id, role: user.role || role },
                config.ACCESS_TOKEN.SECRET as string,
                config.ACCESS_TOKEN.EXPIRY
            )

            const newRefreshToken = quiker.genrateToken(
                { userId: user._id, role: user.role || role },
                config.REFRESH_TOKEN.SECRET as string,
                config.REFRESH_TOKEN.EXPIRY
            )

            user.refreshToken.token = newRefreshToken
            await user.save()

            const DOMAIN = quiker.getDomainFromUrl(config.SERVER_URL as string)
            const isProduction = config.ENV === EApplicationEnvionment.PRODUCTION

            res.cookie('accessToken', newAccessToken, {
                path: '/api/v1',
                domain: DOMAIN,
                sameSite: isProduction ? 'strict' : 'lax',
                maxAge: 1000 * config.ACCESS_TOKEN.EXPIRY,
                httpOnly: true,
                secure: isProduction
            }).cookie('refreshToken', newRefreshToken, {
                path: '/api/v1',
                domain: DOMAIN,
                sameSite: isProduction ? 'strict' : 'lax',
                maxAge: 1000 * config.REFRESH_TOKEN.EXPIRY,
                httpOnly: true,
                secure: isProduction
            })

            return httpResponse(req, res, 200, responceseMessage.SUCCESS, {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                token: newAccessToken
            })
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    forgotPassword: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { body } = req as IForgotPasswordRequest
            const { error, value } = validateJoiSchema<IForgotPasswordRequestBody>(validationForgotPasswordBody, body)
            if (error) {
                return httpError(next, error, req, 422)
            }
            const { email } = value
            const user = await databseService.findUserByEmail(email)
            if (!user) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }

            if (!user.accountConfirmation.status) {
                return httpError(next, new Error(responceseMessage.ACCOUNT_CONFIRMATION_REQUIRED), req, 400)
            }

            const token = quiker.generateRandumId()
            const expiry = quiker.generateResetPasswordExpiry(15)

            // * update user
            user.passwordReset.token = token
            user.passwordReset.expiry = expiry
            await user.save()

            // * send email

            const resetlURL = `${config.FRONTEND_URL}/reset-password/${token}`
            const to = [email]
            const subject = 'Account Password Reset requested'
            const text = `Hey ${user.name}, Please reset your email by clicking on this link below \n\nLink will expire in 15 minutes.\n\n ${resetlURL}`

            emailService.sendEmail(to, subject, text).catch((error) => loger.error('EMAIL_SERVICE', { meta: error }))

            httpResponse(req, res, 200, responceseMessage.SUCCESS, null)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    resetPassword: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { body, params } = req as IResetPasswordRequest
            const { token } = params
            const { error, value } = validateJoiSchema<IResetPasswordRequestBody>(validationResetPasswordBody, body)
            if (error) {
                return httpError(next, error, req, 422)
            }
            const user = await databseService.findUserByPasswordResetToken(token)
            if (!user) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }

            if (!user.accountConfirmation.status) {
                return httpError(next, new Error(responceseMessage.ACCOUNT_CONFIRMATION_REQUIRED), req, 400)
            }

            const { newPassword } = value

            const storedExpiry = user.passwordReset.expiry
            const currentExpiry = dayjs().valueOf()

            if (!storedExpiry) {
                return httpError(next, new Error(responceseMessage.INVALID_REQUEST), req, 400)
            }
            if (currentExpiry > storedExpiry) {
                return httpError(next, new Error(responceseMessage.PASSWORD_RESET_URL_EXPIRED), req, 400)
            }

            const hashedPassword = await quiker.hashedPassword(newPassword)

            // * update password reset token
            user.password = hashedPassword

            user.passwordReset.token = ''
            user.passwordReset.expiry = null
            user.passwordReset.lastResetAt = dayjs().utc().toDate()
            await user.save()

            // * send email
            const to = [user.email]
            const subject = 'Reset account password'
            const text = `Hey ${user.name}, Your password has been successfully reset.`
            emailService.sendEmail(to, subject, text).catch((error) => {
                loger.error('EMAIL_SERVICE', { meta: error })
            })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, null)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    changePassword: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { body, authenticatedUser } = req as IChangePasswordRequest
            const { error, value } = validateJoiSchema<IChangePasswordRequestBody>(validationChangePasswordBody, body)
            if (error) {
                return httpError(next, error, req, 422)
            }
            const { oldPassword, newPassword } = value

            const user = await databseService.findUserById(authenticatedUser._id, '+password')
            if (!user) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }

            const isPasswordMatch = await quiker.comparePassword(oldPassword, user.password)
            if (!isPasswordMatch) {
                return httpError(next, new Error(responceseMessage.INVALID_OLD_PASSWORD), req, 400)
            }

            if (newPassword === oldPassword) {
                return httpError(next, new Error(responceseMessage.PASSWORD_MATCHING_WITH_OLD_PASSWORD), req, 400)
            }
            const hashedPassword = await quiker.hashedPassword(newPassword)
            user.password = hashedPassword
            await user.save()

            // * send email
            const to = [user.email]
            const subject = 'Password changed.'
            const text = `Hey ${user.name}, Your account password has been change successfully.`
            emailService.sendEmail(to, subject, text).catch((error) => {
                loger.error('EMAIL_SERVICE', { meta: error })
            })
            httpResponse(req, res, 200, responceseMessage.SUCCESS, null)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    },
    updateProfile: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { body, authenticatedUser } = req as IUpdateProfileRequest
            const { error, value } = validateJoiSchema<IUpdateProfileRequestBody>(validationUpdateProfileBody, body)
            if (error) {
                return httpError(next, error, req, 422)
            }

            const updatePayload: Partial<IUser> = {}
            if (value.name) {
                updatePayload.name = value.name
            }
            if (value.phone !== undefined) {
                const { isoCode, countryCode, internationalNumber } = quiker.parsePhoneNumber(value.phone)
                updatePayload.phone = { isoCode, countryCode, internationalNumber }
            }

            const updatedUser = await databseService.updateUserById(authenticatedUser._id, updatePayload)
            if (!updatedUser) {
                return httpError(next, new Error(responceseMessage.NOT_FOUND('User')), req, 404)
            }

            httpResponse(req, res, 200, responceseMessage.SUCCESS, updatedUser)
        } catch (error) {
            httpError(next, error, req, 500)
        }
    }
}
