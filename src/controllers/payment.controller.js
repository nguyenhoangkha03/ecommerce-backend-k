const stripeService = require('../services/payment/stripeService');
const sepayService = require('../services/payment/sepayService');
const { Order, OrderItem, User, Product, sequelize } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const { Op } = require('sequelize');

// Create payment intent
const createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, currency = 'usd', orderId } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      throw new AppError('Invalid amount', 400);
    }

    // Create payment intent with metadata
    console.log('Creating payment intent with metadata:', {
      userId,
      orderId: orderId || '',
    });

    const paymentIntent = await stripeService.createPaymentIntent({
      amount,
      currency,
      metadata: {
        userId,
        orderId: orderId || '',
      },
    });

    console.log('Payment intent created:', {
      id: paymentIntent.paymentIntentId,
      metadata: paymentIntent.metadata,
    });

    res.status(200).json({
      status: 'success',
      data: paymentIntent,
    });
  } catch (error) {
    next(error);
  }
};

// Confirm payment
const confirmPayment = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      throw new AppError('Payment intent ID is required', 400);
    }

    const paymentIntent =
      await stripeService.confirmPaymentIntent(paymentIntentId);

    console.log('Payment Intent Retrieved:', {
      id: paymentIntent.id,
      status: paymentIntent.status,
      metadata: paymentIntent.metadata,
    });

    // Update order payment status if orderId exists in metadata
    if (paymentIntent.metadata.orderId) {
      console.log('Updating order:', paymentIntent.metadata.orderId);
      console.log('Payment Intent Status:', paymentIntent.status);

      // First check if order exists
      const existingOrder = await Order.findByPk(
        paymentIntent.metadata.orderId
      );
      console.log(
        'Existing order found:',
        existingOrder
          ? {
              id: existingOrder.id,
              number: existingOrder.number,
              currentPaymentStatus: existingOrder.paymentStatus,
            }
          : 'Order not found'
      );

      if (existingOrder && paymentIntent.status === 'succeeded') {
        const updateResult = await Order.update(
          {
            status: 'processing', // Cập nhật trạng thái đơn hàng
            paymentStatus: 'paid', // Cập nhật trạng thái thanh toán
            paymentTransactionId: paymentIntent.id,
            paymentProvider: 'stripe',
            updatedAt: new Date(),
          },
          {
            where: { id: paymentIntent.metadata.orderId },
          }
        );
        console.log('Order update result:', updateResult);

        // Verify the update
        const updatedOrder = await Order.findByPk(
          paymentIntent.metadata.orderId
        );
        console.log(
          'Order after update:',
          updatedOrder
            ? {
                id: updatedOrder.id,
                number: updatedOrder.number,
                status: updatedOrder.status, // Trạng thái đơn hàng
                paymentStatus: updatedOrder.paymentStatus, // Trạng thái thanh toán
                paymentTransactionId: updatedOrder.paymentTransactionId,
              }
            : 'Order not found after update'
        );
      } else if (!existingOrder) {
        console.log('Order not found for ID:', paymentIntent.metadata.orderId);
      } else {
        console.log('Payment not succeeded, status:', paymentIntent.status);
      }
    } else {
      console.log('No orderId found in payment intent metadata');
    }

    res.status(200).json({
      status: 'success',
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount:
            paymentIntent.currency === 'vnd'
              ? paymentIntent.amount
              : paymentIntent.amount / 100,
          currency: paymentIntent.currency,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create customer
const createCustomer = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if user already has a Stripe customer ID
    if (user.stripeCustomerId) {
      const customer = await stripeService.getCustomer(user.stripeCustomerId);
      return res.status(200).json({
        status: 'success',
        data: { customer },
      });
    }

    // Create new Stripe customer
    const customer = await stripeService.createCustomer({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: user.id,
      },
    });

    // Save Stripe customer ID to user
    await user.update({ stripeCustomerId: customer.id });

    res.status(201).json({
      status: 'success',
      data: { customer },
    });
  } catch (error) {
    next(error);
  }
};

// Get payment methods
const getPaymentMethods = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    if (!user || !user.stripeCustomerId) {
      return res.status(200).json({
        status: 'success',
        data: { paymentMethods: [] },
      });
    }

    const paymentMethods = await stripeService.getPaymentMethods(
      user.stripeCustomerId
    );

    res.status(200).json({
      status: 'success',
      data: { paymentMethods },
    });
  } catch (error) {
    next(error);
  }
};

// Create setup intent for saving payment methods
const createSetupIntent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Create customer if doesn't exist
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await user.update({ stripeCustomerId: customerId });
    }

    const setupIntent = await stripeService.createSetupIntent(customerId);

    res.status(200).json({
      status: 'success',
      data: setupIntent,
    });
  } catch (error) {
    next(error);
  }
};

// Handle Stripe webhooks
const handleWebhook = async (req, res, next) => {
  try {
    // For sandbox/development, temporarily skip webhook verification
    console.log('Webhook received in sandbox mode');
    return res.status(200).json({ received: true });

    // Uncomment below when you have real webhook secret
    // const signature = req.headers['stripe-signature'];
    // const payload = req.body;
    // const event = await stripeService.handleWebhook(payload, signature);

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.created':
        console.log('Customer created:', event.data.object.id);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};

// Helper function to handle successful payments
const handlePaymentSucceeded = async (paymentIntent) => {
  try {
    if (paymentIntent.metadata.orderId) {
      await Order.update(
        {
          status: 'processing', // Cập nhật trạng thái đơn hàng
          paymentStatus: 'paid', // Cập nhật trạng thái thanh toán
          paymentTransactionId: paymentIntent.id,
          paymentProvider: 'stripe',
        },
        {
          where: { id: paymentIntent.metadata.orderId },
        }
      );
      console.log(
        `Payment succeeded for order: ${paymentIntent.metadata.orderId}`
      );
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
};

// Helper function to handle failed payments
const handlePaymentFailed = async (paymentIntent) => {
  try {
    if (paymentIntent.metadata.orderId) {
      await Order.update(
        {
          paymentStatus: 'failed',
          paymentTransactionId: paymentIntent.id,
          paymentProvider: 'stripe',
        },
        {
          where: { id: paymentIntent.metadata.orderId },
        }
      );
      console.log(
        `Payment failed for order: ${paymentIntent.metadata.orderId}`
      );
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
};

// Create refund
const createRefund = async (req, res, next) => {
  try {
    const { orderId, amount, reason } = req.body;

    if (!orderId) {
      throw new AppError('Order ID is required', 400);
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (!order.paymentTransactionId) {
      throw new AppError('No payment transaction found for this order', 400);
    }

    const refund = await stripeService.createRefund({
      paymentIntentId: order.paymentTransactionId,
      amount,
      reason,
    });

    // Update order payment status
    await order.update({
      paymentStatus: 'refunded',
    });

    res.status(200).json({
      status: 'success',
      data: { refund },
    });
  } catch (error) {
    next(error);
  }
};

// Create SePay QR payment
const createSepayPayment = async (req, res, next) => {
  try {
    const { amount, orderId, customerName } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      throw new AppError('Số tiền không hợp lệ', 400);
    }

    if (!orderId) {
      throw new AppError('Mã đơn hàng là bắt buộc', 400);
    }

    // Validate amount
    if (!sepayService.validateAmount(amount)) {
      throw new AppError('Số tiền không hợp lệ (tối đa 500 triệu)', 400);
    }

    // Lấy thông tin đơn hàng để có thông tin sản phẩm
    const order = await Order.findByPk(orderId, {
      include: [
        {
          association: 'items',
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku']
            }
          ]
        }
      ]
    });


    // Tạo danh sách sản phẩm cho description
    const products = order?.items?.map(item => ({
      name: item.Product?.name || 'Sản phẩm',
      sku: item.Product?.sku,
      quantity: item.quantity
    })) || [];

    // Tạo thông tin thanh toán QR
    const paymentInfo = sepayService.createPaymentInfo({
      amount,
      orderId,
      customerName,
      products
    });

    res.status(200).json({
      status: 'success',
      data: paymentInfo,
    });
  } catch (error) {
    next(error);
  }
};

// Handle SePay webhook
const handleSepayWebhook = async (req, res, next) => {
  try {
    console.log('🎯 Received SePay webhook');
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));

    // Xác thực webhook
    const authHeader = req.headers.authorization;
    if (!sepayService.validateWebhook(authHeader)) {
      console.error('Invalid SePay webhook authentication');
      throw new AppError('Unauthorized webhook', 401);
    }

    // Xử lý dữ liệu webhook
    const webhookData = sepayService.processWebhookData(req.body);
    
    if (!webhookData.orderId) {
      console.log('No order ID found in webhook data');
      return res.status(200).json({ 
        status: 'success', 
        message: 'Webhook received but no order ID found' 
      });
    }

    console.log('Processing payment for order:', webhookData.orderId);

    // Tìm đơn hàng - có thể là UUID hoặc shortId
    let order = null;
    
    // Thử tìm bằng UUID trực tiếp
    if (webhookData.orderId.includes('-')) {
      order = await Order.findByPk(webhookData.orderId);
    } else {
      // Nếu là shortId (6-8 số), tìm order có ID chứa shortId này
      const shortId = webhookData.orderId;
      
      // Tìm order có ID chứa shortId này - PostgreSQL compatible với raw SQL
      const orders = await sequelize.query(
        'SELECT * FROM "orders" WHERE REGEXP_REPLACE(REPLACE(CAST("id" AS TEXT), \'-\', \'\'), \'[a-f]\', \'\', \'g\') LIKE :pattern ORDER BY "created_at" DESC LIMIT 1',
        {
          replacements: { pattern: `%${shortId}` },
          type: sequelize.QueryTypes.SELECT,
          model: Order,
          mapToModel: true
        }
      );
      
      order = orders[0] || null;
      
      if (order) {
        console.log('Found order by shortId:', order.id);
      }
    }
    
    if (!order) {
      console.error('Order not found:', webhookData.orderId);
      return res.status(404).json({ 
        status: 'error', 
        message: 'Order not found' 
      });
    }

    console.log('Processing payment for order:', order.id, 'Total:', order.total);

    // Kiểm tra số tiền có khớp không (có thể có sai lệch nhỏ)
    const expectedAmount = parseFloat(order.total);
    const receivedAmount = webhookData.amount;
    const amountDifference = Math.abs(expectedAmount - receivedAmount);
    
    if (amountDifference > 1000) { // Cho phép sai lệch 1000đ
      console.error('Amount mismatch:', {
        expected: expectedAmount,
        received: receivedAmount,
        difference: amountDifference
      });
      
      return res.status(400).json({ 
        status: 'error', 
        message: 'Payment amount mismatch' 
      });
    }

    // Cập nhật trạng thái đơn hàng - Sử dụng order.id thay vì webhookData.orderId
    const updateResult = await Order.update(
      {
        status: 'processing',
        paymentStatus: 'paid',
        paymentTransactionId: webhookData.transactionId,
        paymentProvider: 'sepay',
        paymentMethod: 'bank_transfer',
        updatedAt: new Date(),
      },
      {
        where: { id: order.id }, // FIX: Dùng order.id đã tìm được thay vì webhookData.orderId
      }
    );

    console.log('Order update result:', {
      orderId: order.id,
      updateCount: updateResult[0],
      success: updateResult[0] > 0
    });

    console.log('Order payment status updated successfully:', order.id);

    res.status(200).json({
      status: 'success',
      message: 'Payment processed successfully',
      data: {
        orderId: order.id, // FIX: Trả về order.id thực tế thay vì webhookData.orderId
        orderNumber: order.number,
        transactionId: webhookData.transactionId,
        amount: webhookData.amount,
        webhookOrderId: webhookData.orderId // Giữ lại shortId từ webhook để debug
      }
    });

  } catch (error) {
    console.error('SePay webhook error:', error);
    next(error);
  }
};

// Get SePay payment status (for frontend polling if needed)
const getSepayPaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      throw new AppError('Order ID is required', 400);
    }

    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    res.status(200).json({
      status: 'success',
      data: {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        paymentMethod: order.paymentMethod,
        transactionId: order.paymentTransactionId
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  createCustomer,
  getPaymentMethods,
  createSetupIntent,
  handleWebhook,
  createRefund,
  // SePay methods
  createSepayPayment,
  handleSepayWebhook,
  getSepayPaymentStatus,
};
