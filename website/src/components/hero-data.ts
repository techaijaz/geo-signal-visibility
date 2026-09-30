// Illustrative AI answers for the homepage demo. All brand names are made up.
// {brand} is replaced with whatever the visitor types as their brand.

export type EngineAnswer = {
    engine: string
    intro: string
    picks: { name: string; why: string }[]
}

export type DemoQuestion = {
    id: string
    chip: string
    query: string
    answers: EngineAnswer[]
}

export const demoQuestions: DemoQuestion[] = [
    {
        id: 'sunscreen',
        chip: 'Sunscreen',
        query: 'best sunscreen for oily skin under ₹500',
        answers: [
            { engine: 'chatgpt', intro: 'For oily skin, look for a gel or matte finish with SPF 50. Good options under ₹500:', picks: [
                { name: 'Glowleaf Aqua Gel SPF 50', why: 'light, no white cast' },
                { name: '{brand} Matte Shield SPF 50', why: 'oil control that lasts through Indian summers' },
                { name: 'Suncrest Daily Fluid', why: 'budget pick' }
            ] },
            { engine: 'gemini', intro: 'Popular gel sunscreens that suit oily, acne-prone skin:', picks: [
                { name: 'DermaDaily Clear SPF 50', why: 'non-comedogenic' },
                { name: 'Glowleaf Aqua Gel SPF 50', why: 'widely reviewed' },
                { name: 'Mitti Naturals Sun Veil', why: 'fragrance free' }
            ] },
            { engine: 'claude', intro: 'Three that are well reviewed for oily skin and stay under ₹500:', picks: [
                { name: '{brand} Matte Shield SPF 50', why: 'matte finish, PA++++' },
                { name: 'DermaDaily Clear SPF 50', why: 'gentle on breakouts' },
                { name: 'Suncrest Daily Fluid', why: 'easy to reapply' }
            ] },
            { engine: 'grok', intro: 'Short list for oily skin, all under ₹500:', picks: [
                { name: 'Glowleaf Aqua Gel SPF 50', why: 'most mentioned by buyers' },
                { name: 'Suncrest Daily Fluid', why: 'cheapest per ml' },
                { name: '{brand} Matte Shield SPF 50', why: 'good for long days outdoors' }
            ] },
            { engine: 'deepseek', intro: 'Recommended gel-based sunscreens in India for oily skin:', picks: [
                { name: 'Mitti Naturals Sun Veil', why: 'minimal ingredients' },
                { name: 'DermaDaily Clear SPF 50', why: 'dermatologist tested' },
                { name: 'Glowleaf Aqua Gel SPF 50', why: 'light texture' }
            ] }
        ]
    },
    {
        id: 'coffee',
        chip: 'Cold brew (Hinglish)',
        query: 'sabse accha cold brew coffee brand kaunsa hai India mein?',
        answers: [
            { engine: 'chatgpt', intro: 'India mein cold brew ke liye yeh brands kaafi pasand kiye jaate hain:', picks: [
                { name: 'Kaapi Lab Cold Brew Bags', why: 'ghar pe banana aasaan' },
                { name: 'Monsoon Bean Ready-to-Drink', why: 'smooth, kam kadwa' },
                { name: 'Third Pour Concentrate', why: 'strong flavour' }
            ] },
            { engine: 'gemini', intro: 'Top cold brew picks India mein:', picks: [
                { name: '{brand} Cold Brew Cans', why: 'single origin Chikmagalur beans' },
                { name: 'Kaapi Lab Cold Brew Bags', why: 'value for money' },
                { name: 'Blue Kettle Roasters', why: 'specialty roast' }
            ] },
            { engine: 'claude', intro: 'Agar aap Indian cold brew brand dhoondh rahe hain, to yeh try kijiye:', picks: [
                { name: 'Monsoon Bean Ready-to-Drink', why: 'consistent taste' },
                { name: '{brand} Cold Brew Cans', why: 'fresh roast, subscription option' },
                { name: 'Third Pour Concentrate', why: 'milk ke saath achha' }
            ] },
            { engine: 'grok', intro: 'Log in brands ki sabse zyada baat karte hain:', picks: [
                { name: 'Kaapi Lab Cold Brew Bags', why: 'sabse sasta' },
                { name: 'Blue Kettle Roasters', why: 'coffee lovers ki pasand' }
            ] },
            { engine: 'deepseek', intro: 'Popular cold brew coffee brands in India:', picks: [
                { name: 'Third Pour Concentrate', why: 'strong and bold' },
                { name: 'Monsoon Bean Ready-to-Drink', why: 'easy to find online' },
                { name: 'Kaapi Lab Cold Brew Bags', why: 'good starter option' }
            ] }
        ]
    },
    {
        id: 'shoes',
        chip: 'Running shoes',
        query: 'comfortable running shoes for flat feet, budget ₹4,000',
        answers: [
            { engine: 'chatgpt', intro: 'For flat feet you want stability and arch support. Under ₹4,000:', picks: [
                { name: 'Stride Co. Balance Run', why: 'firm medial support' },
                { name: 'Runhaus Glide 2', why: 'cushioned, wide toe box' },
                { name: 'Arcfoot Daily', why: 'good for beginners' }
            ] },
            { engine: 'gemini', intro: 'Stability running shoes that suit flat feet:', picks: [
                { name: '{brand} Trail Steady', why: 'made for Indian roads, wide fit' },
                { name: 'Stride Co. Balance Run', why: 'reliable arch support' },
                { name: 'Paaon Everyday Runner', why: 'light and breathable' }
            ] },
            { engine: 'claude', intro: 'Good options for overpronation within ₹4,000:', picks: [
                { name: 'Stride Co. Balance Run', why: 'stable heel' },
                { name: 'Arcfoot Daily', why: 'removable insole for orthotics' },
                { name: 'Runhaus Glide 2', why: 'soft ride' }
            ] },
            { engine: 'grok', intro: 'Flat feet? These get the best feedback under ₹4,000:', picks: [
                { name: '{brand} Trail Steady', why: 'strong arch support' },
                { name: 'Paaon Everyday Runner', why: 'great value' },
                { name: 'Runhaus Glide 2', why: 'comfortable for long runs' }
            ] },
            { engine: 'deepseek', intro: 'Recommended stability shoes available in India:', picks: [
                { name: 'Arcfoot Daily', why: 'budget friendly' },
                { name: '{brand} Trail Steady', why: 'wide sizes available' },
                { name: 'Stride Co. Balance Run', why: 'durable sole' }
            ] }
        ]
    }
]
