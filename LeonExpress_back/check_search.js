const { Package, sequelize } = require('./models');
const { Op } = require('sequelize');

async function check() {
  const pkgs = await Package.findAll({
    where: {
      [Op.or]: [
        { tracking_code: { [Op.like]: '%Claudia pal%' } },
        { recipient_name: { [Op.like]: '%Claudia pal%' } },
        { external_tracking_code: { [Op.like]: '%Claudia pal%' } }
      ]
    }
  });
  console.log("Matches 'Claudia pal':", pkgs.length);
  for (const p of pkgs) {
    console.log(p.tracking_code, p.recipient_name, p.status);
  }

  const pkgs2 = await Package.findAll({
    where: {
      recipient_name: { [Op.like]: '%ALEJANDRA IGA%' }
    }
  });
  console.log("Matches 'ALEJANDRA IGA':", pkgs2.length);
  for (const p of pkgs2) {
    console.log(p.tracking_code, p.recipient_name, p.status);
  }
}

check().catch(console.error).finally(() => sequelize.close());
