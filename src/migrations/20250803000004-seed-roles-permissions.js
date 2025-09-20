'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Tạo roles
    const roles = [
      {
        id: uuidv4(),
        name: 'super_admin',
        description: 'Full system access with all permissions',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        name: 'manager',
        description: 'Quản lý - Toàn quyền quản lý hệ thống',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        name: 'product_manager',
        description: 'Quản lý sản phẩm - Manage products, categories, and inventory',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        name: 'customer_service',
        description: 'Nhân viên CSKH - Customer service representative',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: uuidv4(),
        name: 'content_moderator',
        description: 'Người kiểm duyệt - Content moderator and reviewer',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    await queryInterface.bulkInsert('roles', roles);

    // Tạo permissions cơ bản
    const permissions = [
      // Products
      { id: uuidv4(), resource: 'products', action: 'create', description: 'Create products' },
      { id: uuidv4(), resource: 'products', action: 'read', description: 'View products' },
      { id: uuidv4(), resource: 'products', action: 'update', description: 'Update products' },
      { id: uuidv4(), resource: 'products', action: 'delete', description: 'Delete products' },
      
      // Orders
      { id: uuidv4(), resource: 'orders', action: 'create', description: 'Create orders' },
      { id: uuidv4(), resource: 'orders', action: 'read', description: 'View orders' },
      { id: uuidv4(), resource: 'orders', action: 'update', description: 'Update orders' },
      { id: uuidv4(), resource: 'orders', action: 'delete', description: 'Delete orders' },
      
      // Users
      { id: uuidv4(), resource: 'users', action: 'read', description: 'View users' },
      { id: uuidv4(), resource: 'users', action: 'update', description: 'Update users' },
      { id: uuidv4(), resource: 'users', action: 'delete', description: 'Delete users' },
      
      // Dashboard
      { id: uuidv4(), resource: 'dashboard', action: 'read', description: 'View dashboard' },
      
      // Vouchers
      { id: uuidv4(), resource: 'vouchers', action: 'create', description: 'Create vouchers' },
      { id: uuidv4(), resource: 'vouchers', action: 'read', description: 'View vouchers' },
      { id: uuidv4(), resource: 'vouchers', action: 'update', description: 'Update vouchers' },
      { id: uuidv4(), resource: 'vouchers', action: 'delete', description: 'Delete vouchers' },
    ].map(permission => ({
      ...permission,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    await queryInterface.bulkInsert('permissions', permissions);

    // Lấy roles và permissions đã insert
    const insertedRoles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const insertedPermissions = await queryInterface.sequelize.query(
      'SELECT id, resource, action FROM permissions',
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Assign permissions cho Super Admin (all permissions)
    const superAdminRole = insertedRoles.find(r => r.name === 'super_admin');
    const superAdminPermissions = insertedPermissions.map(permission => ({
      id: uuidv4(),
      role_id: superAdminRole.id,
      permission_id: permission.id,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    // Assign permissions cho Manager (all permissions except system-critical)
    const managerRole = insertedRoles.find(r => r.name === 'manager');
    const managerPermissions = insertedPermissions.map(permission => ({
      id: uuidv4(),
      role_id: managerRole.id,
      permission_id: permission.id,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    // Assign permissions cho Product Manager (sản phẩm + vouchers toàn quyền)
    const productManagerRole = insertedRoles.find(r => r.name === 'product_manager');
    const productPermissions = insertedPermissions.filter(p => 
      ['products', 'dashboard', 'vouchers'].includes(p.resource)
    );
    const productManagerPermissions = productPermissions.map(permission => ({
      id: uuidv4(),
      role_id: productManagerRole.id,
      permission_id: permission.id,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    // Assign permissions cho Customer Service (CSKH - chỉ xem vouchers)
    const customerServiceRole = insertedRoles.find(r => r.name === 'customer_service');
    const customerServicePermissions = insertedPermissions.filter(p => 
      ['orders', 'users', 'dashboard'].includes(p.resource) ||
      (p.resource === 'vouchers' && p.action === 'read')
    );
    const customerServiceRolePermissions = customerServicePermissions.map(permission => ({
      id: uuidv4(),
      role_id: customerServiceRole.id,
      permission_id: permission.id,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    // Assign permissions cho Content Moderator (Người kiểm duyệt - chỉ xem vouchers)
    const contentModeratorRole = insertedRoles.find(r => r.name === 'content_moderator');
    const contentModeratorPermissions = insertedPermissions.filter(p => 
      ['products', 'dashboard'].includes(p.resource) && p.action === 'read' ||
      (p.resource === 'vouchers' && p.action === 'read')
    );
    const contentModeratorRolePermissions = contentModeratorPermissions.map(permission => ({
      id: uuidv4(),
      role_id: contentModeratorRole.id,
      permission_id: permission.id,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    await queryInterface.bulkInsert('role_permissions', [
      ...superAdminPermissions,
      ...managerPermissions,
      ...productManagerPermissions,
      ...customerServiceRolePermissions,
      ...contentModeratorRolePermissions,
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
  },
};