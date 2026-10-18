// One rule for "does this brand sell products?": every page, task and query list reads it
export type SiteType = 'shop' | 'service' | 'local' | 'saas' | 'media'
export interface ISiteProfile {
    type: SiteType
    sellsProducts: boolean
    city: string
    pagesWord: string
    place: string
}

const TYPES: Record<string, SiteType> = {
    ecommerce: 'shop',
    service: 'service',
    local_business: 'local',
    saas: 'saas',
    content_media: 'media'
}
export const CITY_RE = /^[\p{L}\p{N} ,.'-]{0,60}$/u

export const siteProfile = (
    brand: { businessType?: string | null; sellsProducts?: boolean | null; city?: string | null } | null | undefined
): ISiteProfile => {
    const bt = brand?.businessType || ''
    // Old brands have no type: they are shops, as before
    const type: SiteType = Object.prototype.hasOwnProperty.call(TYPES, bt) ? TYPES[bt] : 'shop'
    const sellsProducts = typeof brand?.sellsProducts === 'boolean' ? brand.sellsProducts : type === 'shop'
    const city = type === 'service' || type === 'local' ? (brand?.city || '').trim().slice(0, 60) : ''
    return { type, sellsProducts, city, pagesWord: sellsProducts ? 'product pages' : 'main pages', place: city || 'India' }
}
