require('dotenv').config();
const { RoutePackage } = require('./models');

async function checkRP() {
    try {
        const rps = await RoutePackage.findAll({
            where: {
                package_id: '00f9c4a7-a46c-41f0-a6e7-7e3dcb3da1b1'
            }
        });

        console.log('--- ROUTE PACKAGES ---');
        console.log(JSON.stringify(rps.map(rp => ({
            route_id: rp.route_id,
            created_at: rp.created_at
        })), null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkRP();
