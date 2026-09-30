/**
 * Delete the placeholder "Weekly Brand Snapshot" reports that older versions seeded for every
 * new brand (fixed dates in Jun/Jul 2026, never real scans). Real reports are untouched.
 * Usage: node script/cleanup-seeded-reports.js
 */

const mongoose = require('mongoose');
const dotenvFlow = require('dotenv-flow');

dotenvFlow.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
}

const SEEDED_DATES = ['Week of 21 Jul 2026', 'Week of 14 Jul 2026', 'Week of 07 Jul 2026', 'Week of 30 Jun 2026'];

async function cleanup() {
    try {
        await mongoose.connect(DATABASE_URL);
        const res = await mongoose.connection.db.collection('reports').deleteMany({
            title: 'Weekly Brand Snapshot',
            type: 'auto-generated',
            date: { $in: SEEDED_DATES }
        });
        console.log(`✅ Removed ${res.deletedCount} seeded placeholder report(s)`);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

cleanup();
