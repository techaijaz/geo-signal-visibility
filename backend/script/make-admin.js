/**
 * Give an existing account admin access. Sign up normally in the app first, then run:
 *   node script/make-admin.js you@example.com
 * In Docker: docker compose exec api node script/make-admin.js you@example.com
 */

const mongoose = require('mongoose');
const dotenvFlow = require('dotenv-flow');

dotenvFlow.config();

const DATABASE_URL = process.env.DATABASE_URL;
const email = (process.argv[2] || '').trim();

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
}
if (!email) {
    console.error('Usage: node script/make-admin.js <email>');
    process.exit(1);
}

async function makeAdmin() {
    try {
        await mongoose.connect(DATABASE_URL);
        const res = await mongoose.connection.db
            .collection('users')
            .updateOne(
                // Emails are stored as typed at signup, so match case-insensitively
                { email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                { $set: { role: 'admin' } }
            );
        if (res.matchedCount === 0) {
            console.error(`❌ No account with email ${email}. Sign up in the app first.`);
            process.exitCode = 1;
        } else {
            console.log(`✅ ${email} is now an admin. Log out and back in to see the admin portal.`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

makeAdmin();
