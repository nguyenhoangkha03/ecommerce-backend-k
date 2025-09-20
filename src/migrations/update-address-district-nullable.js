'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('addresses', 'district', {
      type: Sequelize.STRING(255),
      allowNull: true // Make district nullable since Vietnam now uses province->ward structure only
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('addresses', 'district', {
      type: Sequelize.STRING(255),
      allowNull: false
    });
  }
};