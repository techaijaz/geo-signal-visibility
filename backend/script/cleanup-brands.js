/**
 * Database Cleanup Script - Delete all brands
 * Usage: node script/cleanup-brands.js
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

// Define minimal schemas for cleanup
const brandSchema = new mongoose.Schema({}, { strict: false });
const orgSchema = new mongoose.Schema({}, { strict: false });
const mentionSchema = new mongoose.Schema({}, { strict: false });
const auditSchema = new mongoose.Schema({}, { strict: false });
const recommendationSchema = new mongoose.Schema({}, { strict: false });
const reportSchema = new mongoose.Schema({}, { strict: false });
const reportShareSchema = new mongoose.Schema({}, { strict: false });

const Brand = mongoose.model('Brand', brandSchema);
const Org = mongoose.model('Org', orgSchema);
const Mention = mongoose.model('Mention', mentionSchema);
const Audit = mongoose.model('Audit', auditSchema);
const Recommendation = mongoose.model('Recommendation', recommendationSchema);
const Report = mongoose.model('Report', reportSchema);
const ReportShare = mongoose.model('ReportShare', reportShareSchema);

async function cleanupDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(DATABASE_URL);
        console.log('✅ Connected to MongoDB\n');

        // Count before deletion
        const brandCount = await Brand.countDocuments();
        const orgCount = await Org.countDocuments();
        const mentionCount = await Mention.countDocuments();
        const auditCount = await Audit.countDocuments();
        const recommendationCount = await Recommendation.countDocuments();
        const reportCount = await Report.countDocuments();
        const reportShareCount = await ReportShare.countDocuments();

        console.log('📊 Current Database State:');
        console.log(`   - Brands: ${brandCount}`);
        console.log(`   - Orgs: ${orgCount}`);
        console.log(`   - Mentions: ${mentionCount}`);
        console.log(`   - Audits: ${auditCount}`);
        console.log(`   - Recommendations: ${recommendationCount}`);
        console.log(`   - Reports: ${reportCount}`);
        console.log(`   - Report Shares: ${reportShareCount}\n`);

        if (brandCount === 0 && orgCount === 0) {
            console.log('✨ Database is already clean. No brands or orgs to delete.');
            await mongoose.disconnect();
            return;
        }

        console.log('🗑️  Deleting all brands and related data...\n');

        // Delete all related data first
        const deletedMentions = await Mention.deleteMany({});
        console.log(`   ✓ Deleted ${deletedMentions.deletedCount} mentions`);

        const deletedAudits = await Audit.deleteMany({});
        console.log(`   ✓ Deleted ${deletedAudits.deletedCount} audits`);

        const deletedRecommendations = await Recommendation.deleteMany({});
        console.log(`   ✓ Deleted ${deletedRecommendations.deletedCount} recommendations`);

        const deletedReports = await Report.deleteMany({});
        console.log(`   ✓ Deleted ${deletedReports.deletedCount} reports`);

        const deletedReportShares = await ReportShare.deleteMany({});
        console.log(`   ✓ Deleted ${deletedReportShares.deletedCount} report shares`);

        // Delete brands
        const deletedBrands = await Brand.deleteMany({});
        console.log(`   ✓ Deleted ${deletedBrands.deletedCount} brands`);

        // Delete orgs
        const deletedOrgs = await Org.deleteMany({});
        console.log(`   ✓ Deleted ${deletedOrgs.deletedCount} orgs`);

        console.log('\n✅ Database cleanup completed successfully!');
        console.log('📝 Note: User accounts are preserved. New users will go through onboarding flow.\n');

        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run cleanup
cleanupDatabase();