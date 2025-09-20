'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'gender', {
      type: Sequelize.ENUM('male', 'female', 'other'),
      allowNull: true,
      after: 'phone'
    });

    await queryInterface.addColumn('Users', 'dateOfBirth', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      after: 'gender'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'gender');
    await queryInterface.removeColumn('Users', 'dateOfBirth');
    
    // Drop the ENUM type if it exists
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Users_gender";');
  }
};