const BASE_URL = 'http://localhost:8080/api/v1'

async function test() {
    const results = []
    const errors = []

    // 1. Health Check
    try {
        const health = await fetch(`${BASE_URL}/health`)
        const healthData = await health.json()
        results.push(`✅ Health: ${healthData.success ? 'OK' : 'FAIL'}`)
    } catch (e) {
        errors.push(`❌ Health: ${e.message}`)
    }

    // 2. Register
    const testUser = {
        name: `TestUser_${Date.now()}`,
        email: `test_${Date.now()}@signal.com`,
        password: 'Test@12345',
        phone: '+919999999999',
        consent: true
    }

    let token = null
    let userEmail = testUser.email

    try {
        const regRes = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        })
        const regData = await regRes.json()
        if (regData.success) {
            results.push(`✅ Register: Success (${testUser.email})`)
        } else {
            results.push(`⚠️ Register: ${regData.message || regData.body || 'Failed'}`)
        }
    } catch (e) {
        errors.push(`❌ Register: ${e.message}`)
    }

    // 3. Login
    try {
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUser.email, password: 'Test@12345' })
        })
        const loginData = await loginRes.json()
        if (loginData.success && loginData.data?.accessToken) {
            token = loginData.data.accessToken
            results.push('✅ Login: Success (token received)')
        } else {
            results.push(`⚠️ Login: ${loginData.message || 'Failed'}`)
        }
    } catch (e) {
        errors.push(`❌ Login: ${e.message}`)
    }

    // 4. Create Brand (agar token mila hai)
    if (token) {
        try {
            const brandPayload = {
                name: 'Test Brand India',
                website: 'https://testbrand.in',
                category: 'Skincare',
                region: 'India',
                role: 'Owner',
                competitors: [
                    { name: 'Mamaearth', website: 'https://mamaearth.in' },
                    { name: 'Plum', website: 'https://plumgoodness.com' }
                ],
                queries: [
                    { text: 'Best skincare brand in India', intent: 'Best-of', lang: 'EN', enabled: true },
                    { text: 'sasta vitamin C serum kaunsa best hai', intent: 'Comparison', lang: 'HI-EN', enabled: true }
                ],
                languages: ['en', 'hi-en']
            }

            const brandRes = await fetch(`${BASE_URL}/brands`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(brandPayload)
            })
            const brandData = await brandRes.json()
            if (brandData.success) {
                results.push(`✅ Create Brand: Success (${brandData.data._id})`)
            } else {
                results.push(`⚠️ Create Brand: ${brandData.message || 'Failed'}`)
            }
        } catch (e) {
            errors.push(`❌ Create Brand: ${e.message}`)
        }
    }

    // Summary
    console.log('\n=== API TEST RESULTS ===')
    results.forEach(r => console.log(r))
    if (errors.length > 0) {
        console.log('\n=== ERRORS ===')
        errors.forEach(e => console.log(e))
    }
    console.log('\n=== DONE ===')
}

test()