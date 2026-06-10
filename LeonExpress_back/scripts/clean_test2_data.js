const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../models');

async function cleanData() {
    const transaction = await sequelize.transaction();
    try {
        const userId = '95b08763-09d0-4f64-8990-1feeca5d7225'; // Test 2 ID

        // 1. Get Pickups
        const [pickups] = await sequelize.query(
            `SELECT pickup_id FROM pickups WHERE user_id = :userId`,
            { replacements: { userId }, transaction }
        );

        if (pickups.length === 0) {
            console.log('No pickups found for Test 2.');
            await transaction.commit();
            return;
        }

        const pickupIds = pickups.map(p => p.pickup_id);
        console.log(`Found ${pickupIds.length} pickups for Test 2.`);

        // 2. Delete Packages
        await sequelize.query(
            `DELETE FROM packages WHERE pickup_id IN (:pickupIds)`,
            { replacements: { pickupIds }, transaction }
        );
        console.log('Deleted packages.');

        // 3. Delete Pickups
        await sequelize.query(
            `DELETE FROM pickups WHERE pickup_id IN (:pickupIds)`,
            { replacements: { pickupIds }, transaction }
        );
        console.log('Deleted pickups.');

        await transaction.commit();
        console.log('Cleanup completed successfully.');
    } catch (error) {
        await transaction.rollback();
        console.error('Error during cleanup:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

cleanData();
