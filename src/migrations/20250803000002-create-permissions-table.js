'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('permissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      resource: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Resource name (e.g., products, orders, users)',
      },
      action: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Action name (e.g., create, read, update, delete)',
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes
    await queryInterface.addIndex('permissions', ['resource']);
    await queryInterface.addIndex('permissions', ['action']);
    await queryInterface.addIndex('permissions', ['resource', 'action'], { 
      unique: true,
      name: 'unique_resource_action'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('permissions');
  },
};