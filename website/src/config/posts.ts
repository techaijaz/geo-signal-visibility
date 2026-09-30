// Blog index. Add a post: create src/pages/blog/<slug>.astro using the Post layout, then list it here.
export type PostMeta = {
    slug: string
    title: string
    description: string
    date: string // ISO date
    minutes: number
}

export const posts: PostMeta[] = [
    {
        slug: 'what-is-geo',
        title: 'What is GEO? A plain guide for Shopify and D2C founders',
        description: 'Generative engine optimisation explained without jargon: how AI assistants pick brands, and the three things you can do about it this month.',
        date: '2026-09-22',
        minutes: 6
    },
    {
        slug: 'can-chatgpt-read-your-store',
        title: 'Can ChatGPT read your store? Check your robots.txt in five minutes',
        description: 'Which AI crawlers exist, what each one is for, and how to check and change your robots.txt on Shopify.',
        date: '2026-09-29',
        minutes: 5
    },
    {
        slug: 'questions-to-track',
        title: 'Which questions should you track? Start with how your customers actually ask',
        description: 'A simple method to pick 15 questions that matter, including Hinglish ones, and avoid tracking vanity queries.',
        date: '2026-10-01',
        minutes: 5
    }
]

export const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
