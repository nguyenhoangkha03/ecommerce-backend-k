'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Thêm permissions còn thiếu
    const missingPermissions = [
      // Categories
      {
        id: uuidv4(),
        resource: 'categories',
        action: 'create',
        description: 'Create categories',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'categories',
        action: 'read',
        description: 'View categories',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'categories',
        action: 'update',
        description: 'Update categories',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'categories',
        action: 'delete',
        description: 'Delete categories',
        created_at: new Date(),
        updated_at: new Date(),
      },
      
      // News
      {
        id: uuidv4(),
        resource: 'news',
        action: 'create',
        description: 'Create news',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'news',
        action: 'read',
        description: 'View news',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'news',
        action: 'update',
        description: 'Update news',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'news',
        action: 'delete',
        description: 'Delete news',
        created_at: new Date(),
        updated_at: new Date(),
      },
      
      // Warranty
      {
        id: uuidv4(),
        resource: 'warranty',
        action: 'create',
        description: 'Create warranty packages',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'warranty',
        action: 'read',
        description: 'View warranty packages',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'warranty',
        action: 'update',
        description: 'Update warranty packages',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'warranty',
        action: 'delete',
        description: 'Delete warranty packages',
        created_at: new Date(),
        updated_at: new Date(),
      },
      
      // Contacts
      {
        id: uuidv4(),
        resource: 'contacts',
        action: 'read',
        description: 'View contacts',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'contacts',
        action: 'update',
        description: 'Update contacts',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'contacts',
        action: 'delete',
        description: 'Delete contacts',
        created_at: new Date(),
        updated_at: new Date(),
      },
      
      // Roles
      {
        id: uuidv4(),
        resource: 'roles',
        action: 'create',
        description: 'Create roles',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'roles',
        action: 'read',
        description: 'View roles',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'roles',
        action: 'update',
        description: 'Update roles',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        resource: 'roles',
        action: 'delete',
        description: 'Delete roles',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    await queryInterface.bulkInsert('permissions', missingPermissions);

    // Lấy roles và permissions đã insert
    const insertedRoles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const insertedPermissions = await queryInterface.sequelize.query(
      "SELECT id, resource, action FROM permissions WHERE resource IN ('categories', 'news', 'warranty', 'contacts', 'roles')",
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Gán tất cả permissions mới cho Super Admin
    const superAdminRole = insertedRoles.find(r => r.name === 'super_admin');
    if (superAdminRole) {
      const superAdminPermissions = insertedPermissions.map(permission => ({
        id: uuidv4(),
        role_id: superAdminRole.id,
        permission_id: permission.id,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await queryInterface.bulkInsert('role_permissions', superAdminPermissions);
    }

    // Gán tất cả permissions mới cho Manager
    const managerRole = insertedRoles.find(r => r.name === 'manager');
    if (managerRole) {
      const managerPermissions = insertedPermissions.map(permission => ({
        id: uuidv4(),
        role_id: managerRole.id,
        permission_id: permission.id,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await queryInterface.bulkInsert('role_permissions', managerPermissions);
    }

    // Gán quyền categories cho Product Manager
    const productManagerRole = insertedRoles.find(r => r.name === 'product_manager');
    const categoryPermissions = insertedPermissions.filter(p => p.resource === 'categories');
    const warrantyPermissions = insertedPermissions.filter(p => p.resource === 'warranty');
    if (productManagerRole) {
      const productManagerNewPermissions = [...categoryPermissions, ...warrantyPermissions].map(permission => ({
        id: uuidv4(),
        role_id: productManagerRole.id,
        permission_id: permission.id,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await queryInterface.bulkInsert('role_permissions', productManagerNewPermissions);
    }

    // Gán quyền contacts cho Customer Service
    const customerServiceRole = insertedRoles.find(r => r.name === 'customer_service');
    const contactPermissions = insertedPermissions.filter(p => p.resource === 'contacts');
    if (customerServiceRole) {
      const customerServiceNewPermissions = contactPermissions.map(permission => ({
        id: uuidv4(),
        role_id: customerServiceRole.id,
        permission_id: permission.id,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await queryInterface.bulkInsert('role_permissions', customerServiceNewPermissions);
    }

    // Gán quyền news:read cho Content Moderator
    const contentModeratorRole = insertedRoles.find(r => r.name === 'content_moderator');
    const newsReadPermission = insertedPermissions.find(p => p.resource === 'news' && p.action === 'read');
    if (contentModeratorRole && newsReadPermission) {
      await queryInterface.bulkInsert('role_permissions', [{
        id: uuidv4(),
        role_id: contentModeratorRole.id,
        permission_id: newsReadPermission.id,
        created_at: new Date(),
        updated_at: new Date(),
      }]);
    }

    console.log('✅ Missing permissions added successfully');
  },

  down: async (queryInterface, Sequelize) => {
    // Xóa role_permissions cho các resources mới
    await queryInterface.sequelize.query(`
      DELETE FROM role_permissions 
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE resource IN ('categories', 'news', 'warranty', 'contacts', 'roles')
      )
    `);

    // Xóa permissions mới
    await queryInterface.bulkDelete('permissions', {
      resource: ['categories', 'news', 'warranty', 'contacts', 'roles']
    }, {});

    console.log('🗑️ Missing permissions removed');
  },
};