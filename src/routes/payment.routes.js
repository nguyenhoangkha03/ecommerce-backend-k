const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');

// Webhook routes (no authentication needed)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleWebhook
);

// SePay webhook route (no authentication needed)
router.post(
  '/sepay-webhook',
  express.json(),
  paymentController.handleSepayWebhook
);

// Test endpoint to verify webhook is reachable (BEFORE authenticate middleware)
router.get('/sepay-webhook/test', (req, res) => {
  console.log('🧪 SePay webhook test endpoint accessed');
  res.json({ 
    status: 'success', 
    message: 'SePay webhook endpoint is reachable',
    timestamp: new Date().toISOString(),
    url: req.originalUrl
  });
});

// Authenticated routes
router.use(authenticate);

// Create payment intent
router.post('/create-payment-intent', paymentController.createPaymentIntent);

// Confirm payment
router.post('/confirm-payment', paymentController.confirmPayment);

// Customer management
router.post('/create-customer', paymentController.createCustomer);
router.get('/payment-methods', paymentController.getPaymentMethods);
router.post('/create-setup-intent', paymentController.createSetupIntent);

// SePay payment methods
router.post('/sepay/create-payment', paymentController.createSepayPayment);
router.get('/sepay/status/:orderId', paymentController.getSepayPaymentStatus);

// Admin routes
router.post('/refund', authorize('admin'), paymentController.createRefund);

module.exports = router;