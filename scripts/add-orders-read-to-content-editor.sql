-- Script để thêm quyền orders:read cho Content Editor role
-- Chạy script này trong PostgreSQL

-- Kiểm tra content_editor role có tồn tại không
SELECT 'Content Editor Role:' as info, id, name, description FROM roles WHERE name = 'content_editor';

-- Kiểm tra orders:read permission có tồn tại không  
SELECT 'Orders Read Permission:' as info, id, resource, action, description FROM permissions WHERE resource = 'orders' AND action = 'read';

-- Kiểm tra đã có quyền này chưa
SELECT 'Existing Role Permission:' as info, rp.id, r.name as role_name, p.resource, p.action 
FROM role_permissions rp
JOIN roles r ON rp.role_id = r.id  
JOIN permissions p ON rp.permission_id = p.id
WHERE r.name = 'content_editor' AND p.resource = 'orders' AND p.action = 'read';

-- Thêm quyền orders:read cho content_editor (nếu chưa có)
INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    r.id as role_id,
    p.id as permission_id,
    NOW() as created_at,
    NOW() as updated_at
FROM roles r, permissions p 
WHERE r.name = 'content_editor' 
  AND p.resource = 'orders' 
  AND p.action = 'read'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Kiểm tra kết quả
SELECT 'Final Result:' as info, r.name as role_name, p.resource, p.action, p.description
FROM role_permissions rp
JOIN roles r ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id  
WHERE r.name = 'content_editor'
ORDER BY p.resource, p.action;