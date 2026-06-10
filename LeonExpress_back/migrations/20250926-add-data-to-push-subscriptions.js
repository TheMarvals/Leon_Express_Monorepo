'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('push_subscriptions', 'data', {
      type: Sequelize.TEXT,
      allowNull: true,
      after: 'auth'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('push_subscriptions', 'data');
  }
};