'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Add googleId column
      await queryInterface.addColumn('users', 'googleId', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      });

      // Update provider enum to include 'google'
      await queryInterface.changeColumn('users', 'provider', {
        type: Sequelize.ENUM('local', 'facebook', 'google'),
        defaultValue: 'local',
        allowNull: false,
      });

      console.log('✅ Successfully added Google fields to users table');
    } catch (error) {
      console.error('❌ Error adding Google fields:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Remove googleId column
      await queryInterface.removeColumn('users', 'googleId');

      // Revert provider enum (remove 'google')
      await queryInterface.changeColumn('users', 'provider', {
        type: Sequelize.ENUM('local', 'facebook'),
        defaultValue: 'local',
        allowNull: false,
      });

      console.log('✅ Successfully removed Google fields from users table');
    } catch (error) {
      console.error('❌ Error removing Google fields:', error);
      throw error;
    }
  }
};