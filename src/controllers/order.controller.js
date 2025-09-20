const {
  Order,
  OrderItem,
  Cart,
  CartItem,
  Product,
  ProductVariant,
  Voucher,
  WarrantyPackage,
  TrackingStep,
  sequelize,
} = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('../services/email/emailService');
const { createDefaultTrackingSteps } = require('./tracking.controller');

// Create order from cart
const createOrder = async (req, res, next) => {
  const userId = req.user.id;
  
  // DEBUG: Check cart items BEFORE transaction
  if (req.body.isBuyNow) {
    console.log('🔍 PRE-TRANSACTION CART CHECK for userId:', userId);
    const { Cart, CartItem } = require('../models');
    const preCart = await Cart.findOne({ where: { userId } });
    if (preCart) {
      const preCartItems = await CartItem.findAll({ where: { cartId: preCart.id } });
      console.log('🔍 PRE-TRANSACTION CART ITEMS:', preCartItems.map(item => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity
      })));
    } else {
      console.log('🔍 PRE-TRANSACTION: No cart found for user');
    }
  }

  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    const {
      shippingFirstName,
      shippingLastName,
      shippingCompany,
      shippingAddress1,
      shippingAddress2,
      shippingCity,
      shippingState,
      shippingZip,
      shippingCountry,
      shippingPhone,
      billingFirstName,
      billingLastName,
      billingCompany,
      billingAddress1,
      billingAddress2,
      billingCity,
      billingState,
      billingZip,
      billingCountry,
      billingPhone,
      paymentMethod,
      notes,
      // Order totals from frontend
      subtotal: frontendSubtotal,
      shippingCost: frontendShippingCost,
      tax: frontendTax,
      total: frontendTotal,
      // Voucher information
      voucherCode,
      voucherDiscount: frontendVoucherDiscount,
      // Buy Now support
      isBuyNow,
      buyNowItems,
    } = req.body;

    // DEBUG: Log Buy Now data
    console.log('🔍 ORDER DEBUG - isBuyNow:', isBuyNow);
    console.log('🔍 ORDER DEBUG - buyNowItems:', buyNowItems ? buyNowItems.length : 'null');
    console.log('🔍 ORDER DEBUG - req.body keys:', Object.keys(req.body));

    let cart;
    let cartItems;

    if (isBuyNow && buyNowItems && buyNowItems.length > 0) {
      // For Buy Now flow, use provided items instead of cart
      console.log('🛒 Buy Now flow detected, using provided items:', buyNowItems.length);
      cartItems = buyNowItems;
      
      // Create a virtual cart object for compatibility
      cart = {
        id: 'virtual-buy-now',
        userId,
        items: buyNowItems.map(item => ({
          id: item.id || `virtual-${Date.now()}-${Math.random()}`,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price,
          Product: {
            id: item.productId,
            name: item.name,
            price: item.price,
            thumbnail: item.image,
            slug: item.slug || `product-${item.productId}`,
            inStock: true,
            stockQuantity: 999,
            sku: item.sku || `${item.productId}`,
          },
          ProductVariant: item.variantId ? {
            id: item.variantId,
            name: item.variantName || 'Default Variant',
            price: item.price,
            stockQuantity: 999,
            sku: item.sku || `${item.productId}-${item.variantId}`,
          } : null,
        }))
      };
    } else {
      // Regular flow, get cart from database
      console.log('🔍 BACKEND: Searching for cart, userId:', userId);
      cart = await Cart.findOne({
        where: {
          userId,
          status: 'active',
        },
        include: [
          {
            association: 'items',
            include: [
              {
                model: Product,
                attributes: [
                  'id',
                  'name',
                  'slug',
                  'price',
                  'thumbnail',
                  'inStock',
                  'stockQuantity',
                  'sku',
                ],
              },
              {
                model: ProductVariant,
                attributes: ['id', 'name', 'price', 'stockQuantity', 'sku'],
              },
            ],
          },
        ],
      });

      console.log('🔍 BACKEND: Cart found:', {
        cartExists: !!cart,
        cartId: cart?.id,
        itemsCount: cart?.items?.length || 0,
        items: cart?.items?.map(item => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity
        })) || []
      });

      if (!cart || cart.items.length === 0) {
        // Additional debug: Check if cart exists but with different status
        const allCarts = await Cart.findAll({ where: { userId } });
        console.log('🔍 BACKEND: All carts for user:', allCarts.map(c => ({
          id: c.id,
          status: c.status,
          createdAt: c.createdAt
        })));
        
        throw new AppError('Giỏ hàng trống', 400);
      }
      
      cartItems = cart.items;
    }

    // Use frontend totals if provided, otherwise calculate
    let subtotal = frontendSubtotal || 0;
    let tax = frontendTax || 0;
    let shippingCost = frontendShippingCost || 0;
    let total = frontendTotal || 0;
    let voucherDiscount = 0;
    let voucher = null;

    // Validate voucher if provided
    if (voucherCode) {
      voucher = await Voucher.findOne({
        where: { 
          code: voucherCode.toUpperCase(),
          isActive: true 
        }
      });

      if (!voucher) {
        throw new AppError('Mã voucher không hợp lệ', 400);
      }

      // Check if voucher is valid
      const validationResult = voucher.canBeUsed(subtotal || frontendSubtotal);
      if (!validationResult.valid) {
        throw new AppError(validationResult.reason, 400);
      }

      // Calculate voucher discount
      voucherDiscount = frontendVoucherDiscount || voucher.calculateDiscount(subtotal || frontendSubtotal, shippingCost);
    }

    // Check stock and calculate totals if not provided by frontend
    if (!frontendSubtotal) {
      for (const item of cart.items) {
        const product = item.Product;
        const variant = item.ProductVariant;

        // Check if product is in stock
        if (!product.inStock) {
          throw new AppError(`Sản phẩm "${product.name}" đã hết hàng`, 400);
        }

        // Check stock quantity
        if (variant) {
          if (variant.stockQuantity < item.quantity) {
            throw new AppError(
              `Biến thể "${variant.name}" của sản phẩm "${product.name}" chỉ còn ${variant.stockQuantity} sản phẩm`,
              400
            );
          }
        } else if (product.stockQuantity < item.quantity) {
          throw new AppError(
            `Sản phẩm "${product.name}" chỉ còn ${product.stockQuantity} sản phẩm`,
            400
          );
        }

        // Calculate item price
        const price = variant ? variant.price : product.price;
        subtotal += price * item.quantity;
      }

      // Calculate totals if not provided by frontend
      tax = subtotal * 0.07; // 7% tax
      // Keep shipping cost from frontend if provided, otherwise default to 0
      shippingCost = frontendShippingCost || 0;
      total = subtotal + tax + shippingCost - voucherDiscount;
    } else {
      // Still validate stock even if using frontend totals
      for (const item of cart.items) {
        const product = item.Product;
        const variant = item.ProductVariant;

        // Check if product is in stock
        if (!product.inStock) {
          throw new AppError(`Sản phẩm "${product.name}" đã hết hàng`, 400);
        }

        // Check stock quantity
        if (variant) {
          if (variant.stockQuantity < item.quantity) {
            throw new AppError(
              `Biến thể "${variant.name}" của sản phẩm "${product.name}" chỉ còn ${variant.stockQuantity} sản phẩm`,
              400
            );
          }
        } else if (product.stockQuantity < item.quantity) {
          throw new AppError(
            `Sản phẩm "${product.name}" chỉ còn ${product.stockQuantity} sản phẩm`,
            400
          );
        }
      }
    }

    // Generate unique order number with retry logic
    const generateUniqueOrderNumber = async () => {
      const date = new Date();
      const year = date.getFullYear().toString().substr(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        // Use current timestamp + random for uniqueness
        const timestamp = Date.now().toString().slice(-5);
        const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
        const orderNumber = `ORD-${year}${month}-${timestamp}${random}`;
        
        // Check if number already exists
        const existingOrder = await Order.findOne({ where: { number: orderNumber } });
        if (!existingOrder) {
          return orderNumber;
        }
        attempts++;
      }
      
      throw new Error('Unable to generate unique order number after maximum attempts');
    };

    const orderNumber = await generateUniqueOrderNumber();

    // Create order
    const order = await Order.create(
      {
        number: orderNumber,
        userId,
        shippingFirstName,
        shippingLastName,
        shippingCompany,
        shippingAddress1,
        shippingAddress2,
        shippingCity,
        shippingState,
        shippingZip,
        shippingCountry,
        shippingPhone,
        billingFirstName,
        billingLastName,
        billingCompany,
        billingAddress1,
        billingAddress2,
        billingCity,
        billingState,
        billingZip,
        billingCountry,
        billingPhone,
        paymentMethod,
        paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending', // COD: pending until cash received
        status: paymentMethod === 'cod' ? 'processing' : 'pending', // COD orders go directly to processing
        subtotal,
        tax,
        shippingCost,
        discount: 0, // Legacy discount field, keep as 0
        voucherCode: voucherCode || null,
        voucherDiscount,
        total,
        notes,
      },
      { transaction }
    );

    // Create order items
    const orderItems = [];
    for (const item of cart.items) {
      const product = item.Product;
      let variant = item.ProductVariant;
      
      // For Buy Now flow, need to fetch real variant from database for stock update
      if (isBuyNow && item.variantId && (!variant || !variant.update)) {
        const { ProductVariant } = require('../models');
        variant = await ProductVariant.findByPk(item.variantId, { transaction });
      }
      
      const price = variant ? variant.price : product.price;
      
      // Calculate warranty total for this item
      const warrantyTotal = item.warrantyPackages
        ? item.warrantyPackages.reduce(
            (warrantySum, warranty) => warrantySum + parseFloat(warranty.price),
            0
          ) * item.quantity
        : 0;
      
      const subtotal = (price * item.quantity) + warrantyTotal;

      const orderItem = await OrderItem.create(
        {
          orderId: order.id,
          productId: product.id,
          variantId: variant ? variant.id : null,
          name: product.name,
          sku: variant ? variant.sku : product.sku,
          price,
          quantity: item.quantity,
          subtotal,
          image: product.thumbnail,
          attributes: variant ? { variant: variant.name } : {},
          warrantyPackageIds: item.warrantyPackageIds || [],
          warrantyTotal,
        },
        { transaction }
      );

      orderItems.push(orderItem);

      // Update stock
      if (variant) {
        await variant.update(
          {
            stockQuantity: variant.stockQuantity - item.quantity,
          },
          { transaction }
        );
      } else {
        await product.update(
          {
            stockQuantity: product.stockQuantity - item.quantity,
          },
          { transaction }
        );
      }
    }

    // Mark cart as converted (skip for Buy Now virtual cart)
    if (!isBuyNow && cart.update) {
      await cart.update(
        {
          status: 'converted',
        },
        { transaction }
      );
    }

    // Clear cart items
    if (isBuyNow) {
      // For Buy Now: items remain in cart for future regular checkout
      // This is the intended behavior
    } else {
      // For regular checkout: clear all cart items
      await CartItem.destroy({
        where: { cartId: cart.id },
        transaction,
      });
    }

    // Update voucher usage count if voucher was used
    if (voucher) {
      await voucher.update(
        { 
          usedCount: voucher.usedCount + 1 
        },
        { transaction }
      );
    }

    await transaction.commit();

    // Create default tracking steps for the new order
    try {
      await createDefaultTrackingSteps(order.id);
    } catch (trackingError) {
      console.error('Failed to create tracking steps:', trackingError);
      // Don't fail the order creation if tracking fails
    }

    // Send order confirmation email
    await emailService.sendOrderConfirmationEmail(req.user.email, {
      orderNumber: order.number,
      orderDate: order.createdAt,
      total: order.total,
      paymentMethod: order.paymentMethod, // Include payment method for email template
      items: orderItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
      })),
      shippingAddress: {
        name: `${order.shippingFirstName} ${order.shippingLastName}`,
        address1: order.shippingAddress1,
        address2: order.shippingAddress2,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
      },
    });

    res.status(201).json({
      status: 'success',
      data: {
        order: {
          id: order.id,
          number: order.number,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt,
        },
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ CREATE ORDER ERROR:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    next(error);
  }
};

// Get user orders
const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const { count, rows: orders } = await Order.findAndCountAll({
      where: { userId },
      include: [
        {
          association: 'items',
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'images', 'price'],
            },
          ],
          // Include warranty information
          attributes: [
            'id', 'name', 'sku', 'price', 'quantity', 'subtotal', 
            'image', 'attributes', 'warrantyPackageIds', 'warrantyTotal'
          ]
        },
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        orders,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get order by ID
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: { id, userId },
      include: [
        {
          association: 'items',
        },
      ],
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    res.status(200).json({
      status: 'success',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// Get order by number
const getOrderByNumber = async (req, res, next) => {
  try {
    const { number } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: { number, userId },
      include: [
        {
          association: 'items',
        },
      ],
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    res.status(200).json({
      status: 'success',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to check if order can be cancelled based on tracking steps
const checkIfOrderCanBeCancelled = async (order) => {
  // If order is already cancelled, don't allow cancellation
  if (order.status === 'cancelled') {
    return {
      canCancel: false,
      reason: 'Đơn hàng đã được hủy trước đó'
    };
  }

  // If order is already delivered, don't allow cancellation
  if (order.status === 'delivered') {
    return {
      canCancel: false,
      reason: 'Đơn hàng đã được giao, không thể hủy'
    };
  }

  // ONLY allow cancellation for COD orders
  if (order.paymentMethod !== 'cod') {
    return {
      canCancel: false,
      reason: 'Chỉ đơn hàng thanh toán khi nhận hàng mới có thể hủy'
    };
  }

  // COD orders that are already paid cannot be cancelled
  if (order.paymentMethod === 'cod' && order.paymentStatus === 'paid') {
    return {
      canCancel: false,
      reason: 'Đơn hàng đã thanh toán, không thể hủy'
    };
  }

  // Check tracking steps if they exist
  if (order.trackingSteps && order.trackingSteps.length > 0) {
    // Find the latest completed step
    const completedSteps = order.trackingSteps
      .filter(step => step.status === 'completed')
      .sort((a, b) => a.stepNumber - b.stepNumber);
    
    const latestCompletedStep = completedSteps[completedSteps.length - 1];
    
    // If no steps are completed yet, allow cancellation (brand new order)
    if (!latestCompletedStep) {
      return {
        canCancel: true,
        reason: 'Đơn hàng chưa được xử lý'
      };
    }
    
    // Allow cancellation only if the latest completed step is 'preparing'
    if (latestCompletedStep.stepName === 'preparing') {
      return {
        canCancel: true,
        reason: 'Đơn hàng đang trong giai đoạn chuẩn bị vận chuyển'
      };
    }
    
    // If 'picked_up' or later steps are completed, don't allow cancellation
    const restrictedSteps = ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
    if (restrictedSteps.includes(latestCompletedStep.stepName)) {
      const stepNames = {
        'picked_up': 'đã lấy hàng',
        'in_transit': 'đang vận chuyển', 
        'out_for_delivery': 'chuẩn bị giao hàng',
        'delivered': 'đã giao hàng'
      };
      
      return {
        canCancel: false,
        reason: `Đơn hàng ${stepNames[latestCompletedStep.stepName]}, không thể hủy`
      };
    }
  }
  
  // Fallback to old logic if no tracking steps (for backwards compatibility)
  if (order.status !== 'pending' && order.status !== 'processing') {
    return {
      canCancel: false,
      reason: 'Đơn hàng không ở trạng thái có thể hủy'
    };
  }
  
  return {
    canCancel: true,
    reason: 'Đơn hàng có thể hủy'
  };
};

// Cancel order
const cancelOrder = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: { id, userId },
      include: [
        {
          association: 'items',
          include: [
            {
              model: Product,
            },
            {
              model: ProductVariant,
            },
          ],
        },
        {
          model: TrackingStep,
          as: 'trackingSteps',
          order: [['stepNumber', 'ASC']],
        },
      ],
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    // Check if order can be cancelled based on tracking steps
    const canCancel = await checkIfOrderCanBeCancelled(order);
    if (!canCancel.canCancel) {
      throw new AppError(canCancel.reason, 400);
    }

    // Update order status
    await order.update(
      {
        status: 'cancelled',
      },
      { transaction }
    );

    // Restore stock
    for (const item of order.items) {
      if (item.variantId) {
        const variant = item.ProductVariant;
        await variant.update(
          {
            stockQuantity: variant.stockQuantity + item.quantity,
          },
          { transaction }
        );
      } else {
        const product = item.Product;
        await product.update(
          {
            stockQuantity: product.stockQuantity + item.quantity,
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    // Send cancellation email
    await emailService.sendOrderCancellationEmail(req.user.email, {
      orderNumber: order.number,
      orderDate: order.createdAt,
    });

    res.status(200).json({
      status: 'success',
      message: 'Đơn hàng đã được hủy',
      data: {
        id: order.id,
        number: order.number,
        status: 'cancelled',
      },
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// Admin: Get all orders
const getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const whereConditions = {};
    if (status) {
      whereConditions.status = status;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where: whereConditions,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
      include: [
        {
          association: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        orders,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Update order status
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findByPk(id, {
      include: [
        {
          association: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    // Update order status
    await order.update({ status });

    // Send status update email
    await emailService.sendOrderStatusUpdateEmail(order.user.email, {
      orderNumber: order.number,
      orderDate: order.createdAt,
      status,
    });

    res.status(200).json({
      status: 'success',
      message: 'Cập nhật trạng thái đơn hàng thành công',
      data: {
        id: order.id,
        number: order.number,
        status: order.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if order can be cancelled
 */
const checkOrderCancellationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: { id, userId },
      include: [
        {
          model: TrackingStep,
          as: 'trackingSteps',
          order: [['stepNumber', 'ASC']],
        },
      ],
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    const canCancel = await checkIfOrderCanBeCancelled(order);

    res.status(200).json({
      status: 'success',
      data: {
        orderId: order.id,
        orderNumber: order.number,
        canCancel: canCancel.canCancel,
        reason: canCancel.reason,
        orderStatus: order.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Thanh toán lại đơn hàng
 */
const repayOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Tìm đơn hàng
    const order = await Order.findOne({
      where: { id, userId },
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    // Kiểm tra trạng thái đơn hàng
    if (
      order.status !== 'pending' &&
      order.status !== 'cancelled' &&
      order.paymentStatus !== 'failed'
    ) {
      throw new AppError('Đơn hàng này không thể thanh toán lại', 400);
    }

    // Cập nhật trạng thái đơn hàng
    await order.update({
      status: 'pending',
      paymentStatus: 'pending',
    });

    // Lấy origin từ request header để tạo URL thanh toán động
    const origin = req.get('origin') || 'http://localhost:5175';

    // Tạo URL thanh toán giả lập
    // Trong thực tế, bạn sẽ tích hợp với cổng thanh toán thực tế ở đây
    const paymentUrl = `${origin}/checkout?repayOrder=${order.id}&amount=${order.total}`;

    res.status(200).json({
      status: 'success',
      message: 'Đơn hàng đã được cập nhật để thanh toán lại',
      data: {
        id: order.id,
        number: order.number,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        paymentUrl: paymentUrl, // Thêm URL thanh toán vào response
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  getOrderByNumber,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  repayOrder,
  checkIfOrderCanBeCancelled,
  checkOrderCancellationStatus,
};
