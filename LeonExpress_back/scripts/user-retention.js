'use strict';
require('dotenv').config({ quiet: true });
const { sequelize } = require('../models');
const { runUserRetention } = require('../services/userRetention');
const dryRun = !process.argv.includes('--apply');
runUserRetention({ dryRun })
  .then(result => console.log(JSON.stringify({ dryRun, ...result })))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
