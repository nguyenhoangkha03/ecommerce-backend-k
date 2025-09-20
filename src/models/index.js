const sequelize = require('../config/sequelize');
const User = require('./user');
const Address = require('./address');
const VietnameseLocation = require('./vietnameseLocation');
const Category = require('./category');
const Product = require('./product');
const ProductCategory = require('./productCategory');
const ProductAttribute = require('./productAttribute');
const ProductVariant = require('./productVariant');
const ProductSpecification = require('./productSpecification');
const Review = require('./review');
const ReviewFeedback = require('./reviewFeedback');
const Cart = require('./cart');
const CartItem = require('./cartItem');
const Order = require('./order');
const OrderItem = require('./orderItem');
const Wishlist = require('./wishlist');
const WarrantyPackage = require('./warrantyPackage');
const ProductWarranty = require('./productWarranty');
const AttributeGroup = require('./attributeGroup');
const AttributeValue = require('./attributeValue');
const ProductAttributeGroup = require('./productAttributeGroup');
const Image = require('./image');
const News = require('./news');
const Contact = require('./contact');
const Role = require('./role');
const Permission = require('./permission');
const RolePermission = require('./rolePermission');
const Voucher = require('./voucher');
const TrackingStep = require('./TrackingStep');
const TrackingDetail = require('./TrackingDetail');

// User - Address relationship
User.hasMany(Address, { foreignKey: 'userId', as: 'addresses' });
Address.belongsTo(User, { foreignKey: 'userId' });

// Address - VietnameseLocation relationships
Address.belongsTo(VietnameseLocation, { 
  foreignKey: 'provinceId', 
  as: 'provinceLocation' 
});
Address.belongsTo(VietnameseLocation, { 
  foreignKey: 'districtId', 
  as: 'districtLocation' 
});
Address.belongsTo(VietnameseLocation, { 
  foreignKey: 'wardId', 
  as: 'wardLocation' 
});

// Category - Category (self-referencing) relationship
Category.hasMany(Category, { foreignKey: 'parentId', as: 'children' });
Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });

// Product - Category relationship (many-to-many)
Product.belongsToMany(Category, {
  through: ProductCategory,
  foreignKey: 'productId',
  otherKey: 'categoryId',
  as: 'categories',
});
Category.belongsToMany(Product, {
  through: ProductCategory,
  foreignKey: 'categoryId',
  otherKey: 'productId',
  as: 'products',
});

// Product - ProductAttribute relationship
Product.hasMany(ProductAttribute, {
  foreignKey: 'productId',
  as: 'attributes',
});
ProductAttribute.belongsTo(Product, { foreignKey: 'productId' });

// Product - ProductVariant relationship
Product.hasMany(ProductVariant, { foreignKey: 'productId', as: 'variants' });
ProductVariant.belongsTo(Product, { foreignKey: 'productId' });

// Product - Default Variant relationship
Product.hasOne(ProductVariant, {
  foreignKey: 'productId',
  as: 'defaultVariant',
  scope: { isDefault: true },
});

// Product - ProductSpecification relationship
Product.hasMany(ProductSpecification, {
  foreignKey: 'productId',
  as: 'productSpecifications',
});
ProductSpecification.belongsTo(Product, { foreignKey: 'productId' });

// Product - Review relationship
Product.hasMany(Review, { foreignKey: 'productId', as: 'reviews' });
Review.belongsTo(Product, { foreignKey: 'productId' });

// User - Review relationship
User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Review - ReviewFeedback relationship
Review.hasMany(ReviewFeedback, { foreignKey: 'reviewId', as: 'feedbacks' });
ReviewFeedback.belongsTo(Review, { foreignKey: 'reviewId' });

// User - ReviewFeedback relationship
User.hasMany(ReviewFeedback, { foreignKey: 'userId' });
ReviewFeedback.belongsTo(User, { foreignKey: 'userId' });

// User - Cart relationship
User.hasMany(Cart, { foreignKey: 'userId', as: 'carts' });
Cart.belongsTo(User, { foreignKey: 'userId' });

// Cart - CartItem relationship
Cart.hasMany(CartItem, { foreignKey: 'cartId', as: 'items' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId' });

// CartItem - Product relationship
CartItem.belongsTo(Product, { foreignKey: 'productId' });
CartItem.belongsTo(ProductVariant, { foreignKey: 'variantId' });

// User - Order relationship
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId' });

// Order - OrderItem relationship
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

// OrderItem - Product relationship  
OrderItem.belongsTo(Product, { foreignKey: 'productId', targetKey: 'id' });
OrderItem.belongsTo(ProductVariant, { foreignKey: 'variantId', targetKey: 'id' });
Product.hasMany(OrderItem, { foreignKey: 'productId', sourceKey: 'id', as: 'orderItems' });

// User - Wishlist - Product relationship
User.belongsToMany(Product, {
  through: Wishlist,
  foreignKey: 'userId',
  otherKey: 'productId',
  as: 'wishlist',
});
Product.belongsToMany(User, {
  through: Wishlist,
  foreignKey: 'productId',
  otherKey: 'userId',
  as: 'wishlistedBy',
});

// Product - WarrantyPackage relationship (many-to-many)
Product.belongsToMany(WarrantyPackage, {
  through: ProductWarranty,
  foreignKey: 'productId',
  otherKey: 'warrantyPackageId',
  as: 'warrantyPackages',
});
WarrantyPackage.belongsToMany(Product, {
  through: ProductWarranty,
  foreignKey: 'warrantyPackageId',
  otherKey: 'productId',
  as: 'products',
});

// ProductWarranty relationships
ProductWarranty.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
ProductWarranty.belongsTo(WarrantyPackage, {
  foreignKey: 'warrantyPackageId',
  as: 'warrantyPackage',
});
Product.hasMany(ProductWarranty, {
  foreignKey: 'productId',
  as: 'productWarranties',
});
WarrantyPackage.hasMany(ProductWarranty, {
  foreignKey: 'warrantyPackageId',
  as: 'productWarranties',
});

// AttributeGroup - AttributeValue relationship
AttributeGroup.hasMany(AttributeValue, {
  foreignKey: 'attributeGroupId',
  as: 'values',
});
AttributeValue.belongsTo(AttributeGroup, {
  foreignKey: 'attributeGroupId',
  as: 'group',
});

// Product - AttributeGroup relationship (many-to-many)
Product.belongsToMany(AttributeGroup, {
  through: ProductAttributeGroup,
  foreignKey: 'productId',
  otherKey: 'attributeGroupId',
  as: 'attributeGroups',
});
AttributeGroup.belongsToMany(Product, {
  through: ProductAttributeGroup,
  foreignKey: 'attributeGroupId',
  otherKey: 'productId',
  as: 'products',
});

// Image relationships
Image.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Image.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Product.hasMany(Image, { foreignKey: 'productId', as: 'productImages' });
User.hasMany(Image, { foreignKey: 'userId', as: 'userImages' });

// Role-Permission relationships
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'roleId',
  otherKey: 'permissionId',
  as: 'permissions',
});
Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permissionId',
  otherKey: 'roleId',
  as: 'roles',
});

// User-Role relationship  
User.belongsTo(Role, { foreignKey: 'roleId', as: 'roleDetails' });
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });

// Order - TrackingStep relationship
Order.hasMany(TrackingStep, { foreignKey: 'orderId', as: 'trackingSteps' });
TrackingStep.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

// TrackingStep - TrackingDetail relationship
TrackingStep.hasOne(TrackingDetail, { foreignKey: 'trackingStepId', as: 'detail' });
TrackingDetail.belongsTo(TrackingStep, { foreignKey: 'trackingStepId', as: 'step' });

// TrackingStep - User (Admin) relationship
TrackingStep.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });
User.hasMany(TrackingStep, { foreignKey: 'adminId', as: 'managedTrackingSteps' });

// TrackingDetail - User (Admin) relationship
TrackingDetail.belongsTo(User, { foreignKey: 'updatedByAdmin', as: 'updatedBy' });
User.hasMany(TrackingDetail, { foreignKey: 'updatedByAdmin', as: 'updatedTrackingDetails' });

// Export models
module.exports = {
  sequelize,
  User,
  Address,
  VietnameseLocation,
  Category,
  Product,
  ProductCategory,
  ProductAttribute,
  ProductVariant,
  ProductSpecification,
  Review,
  ReviewFeedback,
  Cart,
  CartItem,
  Order,
  OrderItem,
  Wishlist,
  WarrantyPackage,
  ProductWarranty,
  AttributeGroup,
  AttributeValue,
  ProductAttributeGroup,
  Image,
  News,
  Contact,
  Role,
  Permission,
  RolePermission,
  Voucher,
  TrackingStep,
  TrackingDetail,
};
