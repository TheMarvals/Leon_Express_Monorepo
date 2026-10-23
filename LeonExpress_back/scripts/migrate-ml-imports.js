'use strict';

// Feed an identifier-only export from the retired gateway. Safe to repeat after cutover.
const { MlImport, sequelize } = require('../models');
async function migrate(rows) {
  if (!Array.isArray(rows)) throw new Error('Se esperaba un array de marcas de importación');
  for (const row of rows) {
    if (!/^\d{1,20}$/.test(String(row.external_id)) || !row.ml_account_id || !['imported', 'skipped'].includes(row.disposition)) throw new Error('Marca inválida');
  }
  let added = 0;
  await sequelize.transaction(async transaction => {
    for (const row of rows) {
      const [record, created] = await MlImport.findOrCreate({ where: { external_id: String(row.external_id) }, defaults: row, transaction });
      if (!created && String(record.ml_account_id) !== String(row.ml_account_id)) throw new Error(`Conflicto de cuenta en ${row.external_id}`);
      if (created) added++;
    }
  });
  return { checked: rows.length, added };
}
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    try { console.log(JSON.stringify(await migrate(JSON.parse(input)))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { await sequelize.close(); }
  });
}
module.exports = { migrate };
