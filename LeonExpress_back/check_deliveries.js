require('dotenv').config();
const { Delivery } = require('./models');

async function checkDeliveries() {
    try {
        const deliveries = await Delivery.findAll({
            where: { package_id: '00f9c4a7-a46c-41f0-a6e7-7e3dcb3da1b1' },
            order: [['attempted_at', 'ASC']]
        });

        console.log(`--- DELIVERIES FOR 00f9c4a7... ---`);
        deliveries.forEach(d => {
            console.log(`ID: ${d.delivery_id} | Status: ${d.status_at_delivery} | Date: ${d.attempted_at} | Receiver: ${d.receiver_name}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkDeliveries();
