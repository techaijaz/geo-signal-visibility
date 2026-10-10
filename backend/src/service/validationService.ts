import Joi from 'joi'
import {
    ILoginRequestBody,
    IRegisterRequestBody,
    IForgotPasswordRequestBody,
    IResetPasswordRequestBody,
    IChangePasswordRequestBody,
    IUpdateProfileRequestBody
} from '../types/userTypes'
import { EBrandRole, EBusinessType, ICreateBrandRequestBody, IUpdateBrandRequestBody } from '../types/brandTypes'

export const validationRegisterBody = Joi.object<IRegisterRequestBody>({
    name: Joi.string().required().min(3).max(72).trim(),
    email: Joi.string().email().required(),
    phone: Joi.string()
        .optional()
        .allow('')
        .pattern(/^\+?[0-9]{10,15}$/)
        .message('Phone number must be a valid 10 to 15 digit number'),
    password: Joi.string().min(8).max(72).required().trim(),
    consent: Joi.boolean().required().valid(true),
    weeklyReportEmails: Joi.boolean().optional().default(false)
})

export const validationLoginBody = Joi.object<ILoginRequestBody>({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required().trim()
})

export const validationForgotPasswordBody = Joi.object<IForgotPasswordRequestBody>({
    email: Joi.string().email().required()
})

export const validationResetPasswordBody = Joi.object<IResetPasswordRequestBody>({
    newPassword: Joi.string().min(8).max(72).required().trim()
})

export const validationChangePasswordBody = Joi.object<IChangePasswordRequestBody>({
    oldPassword: Joi.string().min(8).max(72).required().trim(),
    newPassword: Joi.string().min(8).max(72).required().trim()
})

export const validationUpdateProfileBody = Joi.object<IUpdateProfileRequestBody>({
    name: Joi.string().min(2).max(72).optional().trim(),
    phone: Joi.string().optional().allow('').trim()
})

const competitorJoiSchema = Joi.object({
    name: Joi.string().required().trim(),
    website: Joi.string().uri({ allowRelative: true }).optional().allow('').trim()
})

const queryJoiSchema = Joi.object({
    text: Joi.string().required().trim(),
    intent: Joi.string().optional().allow('').trim(),
    lang: Joi.string().optional().allow('').trim(),
    enabled: Joi.boolean().optional()
})

export const validationCreateBrandBody = Joi.object<ICreateBrandRequestBody>({
    name: Joi.string().required().min(2).max(100).trim(),
    website: Joi.string().uri({ allowRelative: true }).required().trim(),
    category: Joi.string().required().trim(),
    businessType: Joi.string()
        .valid(...Object.values(EBusinessType))
        .optional()
        .default(EBusinessType.ECOMMERCE),
    region: Joi.string().optional().default('India').trim(),
    role: Joi.string()
        .valid(...Object.values(EBrandRole))
        .optional()
        .default(EBrandRole.OWNER),
    competitors: Joi.array().items(competitorJoiSchema).optional().default([]),
    queries: Joi.array().items(queryJoiSchema).optional().default([]),
    languages: Joi.array().items(Joi.string().trim()).optional().default(['en', 'hi-en'])
})

export const validationUpdateBrandBody = Joi.object<IUpdateBrandRequestBody>({
    name: Joi.string().min(2).max(100).optional().trim(),
    website: Joi.string().uri({ allowRelative: true }).optional().trim(),
    category: Joi.string().optional().trim(),
    businessType: Joi.string()
        .valid(...Object.values(EBusinessType))
        .optional(),
    region: Joi.string().optional().trim(),
    role: Joi.string()
        .valid(...Object.values(EBrandRole))
        .optional(),
    competitors: Joi.array().items(competitorJoiSchema).optional(),
    queries: Joi.array().items(queryJoiSchema).optional(),
    languages: Joi.array().items(Joi.string().trim()).optional()
})

export const validateJoiSchema = <T>(schema: Joi.Schema, value: unknown) => {
    const result = schema.validate(value)
    return {
        value: result.value as T,
        error: result.error?.message
    }
}

export const validationEmailPreferencesBody = Joi.object<{ weeklyReportEmails: boolean }>({
    weeklyReportEmails: Joi.boolean().required()
})

const productJoiSchema = Joi.object({
    shopifyId: Joi.string().allow(null).optional(),
    title: Joi.string().trim().max(300).required(),
    shortName: Joi.string().trim().min(2).max(60).required(),
    aliases: Joi.array().items(Joi.string().trim().min(2).max(60)).max(3).optional().default([]),
    url: Joi.string().uri().allow('').optional().default(''),
    price: Joi.number().min(0).allow(null).optional().default(null),
    image: Joi.string().allow('').optional().default(''),
    productType: Joi.string().allow('').optional().default(''),
    nameEditedByUser: Joi.boolean().optional().default(false)
})
export const validationSaveProductsBody = Joi.object({ products: Joi.array().items(productJoiSchema).max(200).required() })
export const validationShortNamesBody = Joi.object({ titles: Joi.array().items(Joi.string().trim().max(300)).min(1).max(50).required() })

// Free checker (public)
export const validationFreeCheckSite = Joi.object({ url: Joi.string().trim().max(300).required(), category: Joi.string().trim().max(80) })
export const validationFreeCheckCreate = Joi.object({
    url: Joi.string().trim().max(300).required(),
    brandName: Joi.string().trim().min(2).max(80).required(),
    category: Joi.string().trim().max(80).required(),
    questions: Joi.array().items(Joi.string().trim().max(200)).length(3).unique().required(),
    turnstileToken: Joi.string().allow('').max(2048),
    tz: Joi.string().allow('').max(64)
})
export const validationFreeCheckEmail = Joi.object({
    email: Joi.string().trim().max(254).required(),
    marketingConsent: Joi.boolean().default(false)
})
export const validationFreeCheckVerify = Joi.object({ code: Joi.string().trim().length(6).required() })
