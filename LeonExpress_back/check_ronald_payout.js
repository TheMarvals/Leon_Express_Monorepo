require('dotenv').config();
const { DriverPayout, PayoutItem, Package } = require('./models');

async function checkRonaldPayout() {
    try {
        const payout = await DriverPayout.findOne({
            where: { user_id: '130ab480-4892-4a3a-8cee-26dbd093711e' },
            order: [['created_at', 'DESC']],
            include: [{ model: PayoutItem, as: 'payoutItems', include: [{ model: Package, as: 'package' }] }]
        });

        if (!payout) {
            console.log('No payout found for Ronald');
            process.exit(0);
        }

        console.log(`--- PAYOUT FOR RONALD (ID: ${payout.payout_id}) ---`);
        payout.payoutItems.forEach(item => {
            console.log(`- ${item.item_description}: ${item.amount} (Package: ${item.package?.tracking_code})`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkRonaldPayout();
