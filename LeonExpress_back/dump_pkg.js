require('dotenv').config();
const { Package, Delivery, RoutePackage, Route } = require('./models');

async function dump() {
    try {
        const pkg = await Package.findOne({
            where: { tracking_code: 'LE558391' },
            include: [
                { model: Delivery, as: 'deliveries' },
                {
                    model: RoutePackage,
                    as: 'routePackages',
                    include: [{ model: Route, as: 'route' }]
                }
            ]
        });

        if (!pkg) {
            console.log('Package not found');
            process.exit(0);
        }

        console.log('--- PACKAGE ---');
        console.log(JSON.stringify({
            package_id: pkg.package_id,
            tracking_code: pkg.tracking_code,
            status: pkg.status,
            created_at: pkg.created_at,
            updated_at: pkg.updated_at
        }, null, 2));

        console.log('--- DELIVERIES ---');
        console.log(JSON.stringify(pkg.deliveries.map(d => ({
            delivery_id: d.delivery_id,
            status_at_delivery: d.status_at_delivery,
            attempted_at: d.attempted_at,
            created_at: d.created_at
        })), null, 2));

        console.log('--- ROUTES ---');
        console.log(JSON.stringify(pkg.routePackages.map(rp => ({
            route_id: rp.route?.route_id,
            status: rp.route?.status,
            start_date: rp.route?.start_date
        })), null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
dump();
