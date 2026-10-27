'use strict';

const { Op } = require('sequelize');

/**
 * Builds a Sequelize date range filter object for startDate and endDate.
 * Handles strings (YYYY-MM-DD or ISO) and Date objects.
 * Sets start date to 00:00:00 and end date to 23:59:59.999.
 *
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @returns {object|null} Sequelize filter object with Op.gte and/or Op.lte, or null if neither provided.
 */
function parseDateRange(startDate, endDate) {
  const dateFilter = {};

  if (startDate) {
    const s = String(startDate).trim();
    const start = new Date(s.includes('T') ? s : `${s}T00:00:00`);
    if (!isNaN(start.getTime())) {
      dateFilter[Op.gte] = start;
    }
  }

  if (endDate) {
    const e = String(endDate).trim();
    const end = new Date(e.includes('T') ? e : `${e}T23:59:59.999`);
    if (!isNaN(end.getTime())) {
      dateFilter[Op.lte] = end;
    }
  }

  return Reflect.ownKeys(dateFilter).length > 0 ? dateFilter : null;
}

module.exports = { parseDateRange };
