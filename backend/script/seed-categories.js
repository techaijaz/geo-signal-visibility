/**
 * Migration script to populate default categories
 * Usage: node script/seed-categories.js
 */

const mongoose = require('mongoose');
const dotenvFlow = require('dotenv-flow');

// Load environment variables
dotenvFlow.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
}

// Define category schema
const categorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    description: String,
    isActive: Boolean
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

// Default categories (comprehensive list covering all industries)
const defaultCategories = [
    { name: 'SaaS & Software', slug: 'saas-software', description: 'Software as a Service, cloud tools, and B2B platforms', isActive: true },
    { name: 'E-Commerce & Retail', slug: 'ecommerce-retail', description: 'Online shopping, DTC brands, storefronts, and retail', isActive: true },
    { name: 'FinTech & Banking', slug: 'fintech-banking', description: 'Financial technology, banking, investments, loans & payments', isActive: true },
    { name: 'HealthTech & Healthcare', slug: 'healthtech-healthcare', description: 'Health apps, medical services, digital diagnostics, and telehealth', isActive: true },
    { name: 'EdTech & Learning', slug: 'edtech-learning', description: 'Educational tech, online courses, test prep, and learning platforms', isActive: true },
    { name: 'Skincare & Personal Care', slug: 'skincare-personal-care', description: 'Skincare, grooming, personal hygiene, and self-care products', isActive: true },
    { name: 'Beauty & Cosmetics', slug: 'beauty-cosmetics', description: 'Makeup, cosmetics, haircare, and beauty accessories', isActive: true },
    { name: 'Food & Beverage', slug: 'food-beverage', description: 'Restaurants, food delivery apps, packaged food & beverages', isActive: true },
    { name: 'Travel & Hospitality', slug: 'travel-hospitality', description: 'Airlines, hotels, travel booking, homestays & tourism', isActive: true },
    { name: 'Real Estate & Property', slug: 'realestate-property', description: 'Property listings, commercial space, rentals, and co-working', isActive: true },
    { name: 'Automotive & Mobility', slug: 'automotive-mobility', description: 'Cars, electric vehicles (EV), bikes, and mobility services', isActive: true },
    { name: 'Consumer Electronics & Gadgets', slug: 'consumer-electronics', description: 'Smartphones, audio gear, wearables, and tech gadgets', isActive: true },
    { name: 'Home, Furniture & Living', slug: 'home-furniture-living', description: 'Home decor, furniture, lighting, and kitchen appliances', isActive: true },
    { name: 'Fashion, Apparel & Accessories', slug: 'fashion-apparel-accessories', description: 'Clothing, footwear, bags, watches, and fashion wear', isActive: true },
    { name: 'Media, Gaming & Entertainment', slug: 'media-gaming-entertainment', description: 'Streaming services, video games, esports, and news media', isActive: true },
    { name: 'Artificial Intelligence & ML', slug: 'ai-ml', description: 'AI tools, Generative AI models, and machine learning platforms', isActive: true },
    { name: 'Cybersecurity & Data Privacy', slug: 'cybersecurity-privacy', description: 'Data protection, network security, IAM, and privacy tools', isActive: true },
    { name: 'Cloud, DevOps & Infrastructure', slug: 'cloud-devops-infra', description: 'Cloud hosting, DevOps CI/CD, databases, and IT infra', isActive: true },
    { name: 'Marketing, Advertising & PR', slug: 'marketing-advertising-pr', description: 'Digital marketing software, ad platforms, SEO, and PR agencies', isActive: true },
    { name: 'HRTech & Recruitment', slug: 'hrtech-recruitment', description: 'HR software, job portals, payroll, and talent acquisition', isActive: true },
    { name: 'LegalTech & Compliance', slug: 'legaltech-compliance', description: 'Legal practice management, contract AI, and compliance tools', isActive: true },
    { name: 'Logistics, Supply Chain & Delivery', slug: 'logistics-supplychain-delivery', description: 'Courier, warehousing, hyper-local delivery, and supply chain tech', isActive: true },
    { name: 'Fitness, Sports & Wellness', slug: 'fitness-sports-wellness', description: 'Gyms, fitness gear, nutrition supplements, and wellness apps', isActive: true },
    { name: 'Jewelry, Watches & Luxury Goods', slug: 'jewelry-watches-luxury', description: 'Fine jewelry, luxury watches, and high-end lifestyle goods', isActive: true },
    { name: 'Mother, Baby & Kids Care', slug: 'mother-baby-kids', description: 'Baby products, toys, maternity care, and kids fashion', isActive: true },
    { name: 'Pet Care & Supplies', slug: 'pet-care-supplies', description: 'Pet food, grooming, veterinary care, and pet accessories', isActive: true },
    { name: 'Agriculture & AgriTech', slug: 'agriculture-agritech', description: 'Farming technology, ag-commerce, equipment, and produce', isActive: true },
    { name: 'Renewable Energy & CleanTech', slug: 'renewable-energy-cleantech', description: 'Solar power, clean technology, recycling, and sustainability', isActive: true },
    { name: 'Crypto, Web3 & Blockchain', slug: 'crypto-web3-blockchain', description: 'Crypto exchanges, Web3 protocols, wallets, and DeFi', isActive: true },
    { name: 'Construction & Architecture', slug: 'construction-architecture', description: 'Building materials, architectural services, and ConTech', isActive: true },
    { name: 'Professional & Business Services', slug: 'professional-business-services', description: 'Consulting, accounting, auditing, and enterprise services', isActive: true },
    { name: 'Non-Profit, NGO & Social Impact', slug: 'nonprofit-ngo-social', description: 'Charities, social enterprises, fundraising, and NGOs', isActive: true },
    { name: 'Events, Ticketing & Entertainment', slug: 'events-ticketing-entertainment', description: 'Concerts, conferences, event planning, and ticketing', isActive: true },
    { name: 'Industrial, Manufacturing & B2B', slug: 'industrial-manufacturing-b2b', description: 'Machinery, raw materials, industrial supplies, and B2B tech', isActive: true },
    { name: 'Insurance & InsurTech', slug: 'insurance-insurtech', description: 'Health, life, vehicle, property insurance, and InsurTech', isActive: true },
    { name: 'Other / General', slug: 'other-general', description: 'Other categories and niche industries', isActive: true }
];

async function seedCategories() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(DATABASE_URL);
        console.log('✅ Connected to MongoDB\n');

        // Check existing categories
        const existingCount = await Category.countDocuments();
        console.log(`📊 Current categories in database: ${existingCount}\n`);

        if (existingCount > 0) {
            console.log('⚠️  Categories already exist. Do you want to:');
            console.log('   1. Skip (keep existing categories)');
            console.log('   2. Add missing categories only');
            console.log('   3. Clear all and reseed\n');
            console.log('For now, adding missing categories only...\n');
        }

        let addedCount = 0;
        let skippedCount = 0;

        for (const category of defaultCategories) {
            const existing = await Category.findOne({ slug: category.slug });

            if (existing) {
                console.log(`   ⏭️  Skipped: ${category.name} (already exists)`);
                skippedCount++;
            } else {
                await Category.create(category);
                console.log(`   ✓ Added: ${category.name}`);
                addedCount++;
            }
        }

        console.log(`\n✅ Migration completed!`);
        console.log(`   - Added: ${addedCount} categories`);
        console.log(`   - Skipped: ${skippedCount} categories`);
        console.log(`   - Total in DB: ${await Category.countDocuments()} categories\n`);

        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run migration
seedCategories();
