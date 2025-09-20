'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create tracking_steps table
    await queryInterface.createTable('tracking_steps', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      step_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
        },
      },
      step_name: {
        type: Sequelize.ENUM(
          'preparing',
          'picked_up',
          'in_transit',
          'out_for_delivery',
          'delivered'
        ),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          'pending',
          'completed',
          'delayed',
          'failed',
          'on_hold'
        ),
        defaultValue: 'pending',
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      estimated_time: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create tracking_details table
    await queryInterface.createTable('tracking_details', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      tracking_step_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tracking_steps',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      shipper_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      shipper_phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      proof_images: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      has_issue: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      issue_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      issue_type: {
        type: Sequelize.ENUM(
          'address_incorrect',
          'customer_unavailable',
          'weather_delay',
          'vehicle_breakdown',
          'other'
        ),
        allowNull: true,
      },
      estimated_resolution: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      admin_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      updated_by_admin: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('tracking_steps', {
      fields: ['order_id', 'step_number'],
      unique: true,
      name: 'tracking_steps_order_step_unique',
    });

    await queryInterface.addIndex('tracking_steps', ['order_id']);
    await queryInterface.addIndex('tracking_steps', ['step_name']);
    await queryInterface.addIndex('tracking_steps', ['status']);
    await queryInterface.addIndex('tracking_details', ['tracking_step_id']);
    await queryInterface.addIndex('tracking_details', ['has_issue']);

    // Add current_tracking_step to orders table
    await queryInterface.addColumn('orders', 'current_tracking_step', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: 'Bước tracking hiện tại (1-5)',
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove column from orders table
    await queryInterface.removeColumn('orders', 'current_tracking_step');

    // Drop tables in reverse order
    await queryInterface.dropTable('tracking_details');
    await queryInterface.dropTable('tracking_steps');
  },
};