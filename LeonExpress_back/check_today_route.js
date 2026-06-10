require('dotenv').config();
const { Package, Route, RoutePackage, User, Delivery } = require('./models');

async function checkTodayRoute() {
    try {
        const routeId = '305901a9-47a4-47eb-889f-9b566a958e11';
        const route = await Route.findByPk(routeId, {
            include: [
                { model: User, as: 'user' },
                {
                    model: RoutePackage,
                    as: 'routePackages',
                    include: [{ model: Package, as: 'package' }]
                }
            ]
        });

        if (!route) {
            console.log('Route not found');
            process.exit(0);
        }

        console.log(`--- ROUTE ${routeId} ---`);
        console.log(`Status: ${route.status}`);
        console.log(`Driver: ${route.user?.full_name}`);
        console.log(`Packages count: ${route.routePackages.length}`);

        for (const rp of route.routePackages) {
            if (rp.package.tracking_code === 'LE558391') {
                console.log(`Found LE558391 in this route!`);
                console.log(`RP Created at: ${rp.created_at}`);
                console.log(`Package Status: ${rp.package.status}`);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkTodayRoute();
