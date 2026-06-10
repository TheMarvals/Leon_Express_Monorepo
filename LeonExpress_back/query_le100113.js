require('dotenv').config();
const { Package, AuditLog, RoutePackage, Route, Delivery, Pickup } = require('./models');

async function checkPackage() {
    try {
        const pkg = await Package.findOne({
            where: { tracking_code: 'LE100113' },
            include: [
                { model: Delivery, as: 'deliveries' },
                {
                    model: RoutePackage,
                    as: 'routePackages',
                    include: [{ model: Route, as: 'route' }]
                },
                { model: Pickup, as: 'pickup' }
            ]
        });

        if (!pkg) {
            console.log('Package LE100113 not found.');
            process.exit(0);
        }

        console.log('--- PACKAGE DATA ---');
        console.log(JSON.stringify(pkg.toJSON(), null, 2));

        console.log('\n--- AUDIT LOGS FOR PACKAGE ---');
        const logs = await AuditLog.findAll({
            where: {
                target_table: 'packages',
                target_id: pkg.package_id
            },
            order: [['created_at', 'ASC']]
        });
        
        console.log(JSON.stringify(logs.map(l => l.toJSON()), null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkPackage();
