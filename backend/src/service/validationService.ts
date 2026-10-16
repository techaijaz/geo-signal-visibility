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
import { isPrivateAddress } from '../util/publicUrl'

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
    website: publicWebsite().optional().allow('').trim()
})

const queryJoiSchema = Joi.object({
    text: Joi.string().required().trim(),
    intent: Joi.string().optional().allow('').trim(),
    lang: Joi.string().optional().allow('').trim(),
    enabled: Joi.boolean().optional()
})

export const validationCreateBrandBody = Joi.object<ICreateBrandRequestBody>({
    name: Joi.string().required().min(2).max(100).trim(),
    website: publicWebsite().required().trim(),
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
    developerEmail: Joi.string()
        .trim()
        .lowercase()
        .email()
        .allow('')
        .optional()
        .messages({ 'string.email': "Enter your developer's email, like dev@agency.in" }),
    website: publicWebsite().optional().trim(),
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

// A brand website is opened by the server, so an address inside our network is refused when saved
function publicWebsite() {
    return Joi.string()
        .uri({ allowRelative: true })
        .custom((v: string, h) => (v && isPrivateAddress(/^https?:\/\//i.test(v) ? v : `https://${v}`) ? h.error('any.invalid') : v))
        .messages({ 'any.invalid': 'Website must be a public website address' })
}

const productJoiSchema = Joi.object({
    shopifyId: Joi.string().allow(null).optional(),
    title: Joi.string().trim().max(300).required(),
    shortName: Joi.string().trim().min(2).max(60).required().messages({
        'string.min': 'Product name must be 2 to 60 letters',
        'string.max': 'Product name must be 2 to 60 letters',
        'string.empty': 'Product name must be 2 to 60 letters'
    }),
    aliases: Joi.array().items(Joi.string().trim().min(2).max(60)).max(3).optional().default([]).messages({
        'string.min': 'Other names must be 2 to 60 letters each, up to 3',
        'string.max': 'Other names must be 2 to 60 letters each, up to 3',
        'array.max': 'Other names must be 2 to 60 letters each, up to 3'
    }),
    url: Joi.string()
        .uri()
        .allow('')
        .optional()
        .default('')
        .custom((v: string, h) => (v && isPrivateAddress(v) ? h.error('any.invalid') : v))
        .messages({
            'any.invalid': 'Product link must be a public website address',
            'string.uri': 'Product link must be a full web address, like https://yourstore.com/products/silk-oud'
        }),
    price: Joi.number()
        .min(0)
        .allow(null)
        .optional()
        .default(null)
        .messages({ 'number.min': 'Price must be 0 or more', 'number.base': 'Price must be 0 or more' }),
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

// Seller details printed on invoices (Admin → Billing)
export const validationBillingSeller = Joi.object({
    legalName: Joi.string().trim().min(2).max(120).required(),
    address: Joi.string().trim().min(5).max(300).required(),
    email: Joi.string().trim().email().required(),
    pan: Joi.string()
        .trim()
        .uppercase()
        .allow('')
        .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
        .messages({ 'string.pattern.base': 'PAN must look like ABCDE1234F (5 letters, 4 digits, 1 letter)' }),
    gstin: Joi.string()
        .trim()
        .uppercase()
        .allow('')
        .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
        .messages({ 'string.pattern.base': 'GSTIN must be 15 characters, like 09ABCDE1234F1Z5' })
})
