'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Drop the foreign key constraint from the child table (audit_log)
    // You need the name of the foreign key constraint. It's 'audit_log_ibfk_1' from your error.
    // Replace 'audit_log_ibfk_1' with the actual name if it's different.
    await queryInterface.removeConstraint('audit_log', 'audit_log_ibfk_1');

    // Step 2: Change the type of the user_id column in the users table to UUID
    await queryInterface.changeColumn('users', 'user_id', {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4, // Keep this if you want new UUIDs auto-generated
      primaryKey: true, // Assuming it's the primary key
      allowNull: false,
    });

    // Step 3: Change the type of the user_id column in the audit_log table to UUID
    // Ensure 'user_id' in audit_log is the correct column name referencing users
    await queryInterface.changeColumn('audit_log', 'user_id', {
      type: Sequelize.UUID,
      allowNull: true, // Assuming it can be null if a user is deleted, or false if always linked
    });

    // Step 4: Re-add the foreign key constraint to the audit_log table
    await queryInterface.addConstraint('audit_log', {
      fields: ['user_id'], // Column in audit_log
      type: 'foreign key',
      name: 'audit_log_ibfk_1', // Use the original name or a new one
      references: {
        table: 'users',
        field: 'user_id', // Column in users
      },
      onDelete: 'SET NULL', // Or 'CASCADE', 'RESTRICT', 'NO ACTION' - choose what you want
      onUpdate: 'CASCADE', // Typically 'CASCADE' for PK updates
    });
  },

  down: async (queryInterface, Sequelize) => {
    // This is the rollback logic. It reverses the 'up' method.
    // Step 1: Drop the foreign key constraint from audit_log
    await queryInterface.removeConstraint('audit_log', 'audit_log_ibfk_1');

    // Step 2: Revert the user_id column in audit_log to its original type (e.g., INTEGER)
    await queryInterface.changeColumn('audit_log', 'user_id', {
      type: Sequelize.INTEGER, // Assuming original type was INTEGER
      allowNull: true,
    });

    // Step 3: Revert the user_id column in users to its original type (e.g., INTEGER AUTO_INCREMENT)
    await queryInterface.changeColumn('users', 'user_id', {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true, // If it was auto-incrementing before
      allowNull: false,
    });

    // Step 4: Re-add the foreign key constraint with original settings
    await queryInterface.addConstraint('audit_log', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'audit_log_ibfk_1',
      references: {
        table: 'users',
        field: 'user_id',
      },
      onDelete: 'RESTRICT', // Revert to original onDelete setting
      onUpdate: 'RESTRICT', // Revert to original onUpdate setting
    });
  }
};