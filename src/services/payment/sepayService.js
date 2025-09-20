const { AppError } = require('../../middlewares/errorHandler');

class SepayService {
  constructor() {
    this.bankAccount = 'VQRQADOUA2947';
    this.bankName = 'MBBank';
    this.accountHolder = 'LE TUAN KIET';
    this.mainAccount = '0877748977';
    this.webhookApiKey = '4n5nb5n69dsd9fcns8f6s6c8c7vdf';
    this.baseQRUrl = 'https://qr.sepay.vn/img';
  }

  /**
   * Tạo QR Code URL cho thanh toán
   * @param {Object} params - Payment parameters
   * @param {number} params.amount - Số tiền thanh toán
   * @param {string} params.description - Nội dung chuyển khoản (mã đơn hàng)
   * @param {string} params.orderId - ID đơn hàng
   * @returns {Object} QR code info
   */
  generateQRCode({ amount, description, orderId }) {
    try {
      // Format amount: đảm bảo là số nguyên
      const formattedAmount = Math.round(amount);
      
      // Tạo description ngắn - lấy 6 số cuối từ orderId để tương thích VietQR
      let transferDescription;
      if (description) {
        transferDescription = description;
      } else {
        // Tạo mã ngắn từ UUID - lấy 6 ký tự cuối (chỉ số)
        const shortId = orderId.replace(/-/g, '').replace(/[a-f]/g, '').slice(-6) || Date.now().toString().slice(-6);
        transferDescription = `DH${shortId}`;
      }
      
      // Tạo URL QR code theo format SePay
      const qrUrl = `${this.baseQRUrl}?acc=${this.bankAccount}&bank=${this.bankName}&amount=${formattedAmount}&des=${transferDescription}`;
      
      return {
        qrUrl,
        bankAccount: this.bankAccount,
        bankName: this.bankName,
        accountHolder: this.accountHolder,
        amount: amount,
        description: transferDescription,
        orderId: orderId,
        paymentMethod: 'sepay_qr',
        instructions: [
          'Mở ứng dụng ngân hàng của bạn',
          'Quét mã QR hoặc chuyển khoản thủ công theo thông tin bên dưới',
          'Kiểm tra thông tin và xác nhận chuyển khoản',
          'Đơn hàng sẽ được xử lý tự động sau khi thanh toán thành công'
        ],
        manualTransferInfo: {
          bankName: 'MBBank',
          accountNumber: this.mainAccount,
          accountHolder: this.accountHolder,
          amount: this.formatAmount(amount),
          description: transferDescription
        }
      };
    } catch (error) {
      console.error('SePay generateQRCode error:', error);
      throw new AppError('Không thể tạo mã QR thanh toán', 500);
    }
  }

  /**
   * Xác thực webhook từ SePay
   * @param {string} authHeader - Header Authorization từ request
   * @returns {boolean} True nếu hợp lệ
   */
  validateWebhook(authHeader) {
    const expectedAuth = `Apikey ${this.webhookApiKey}`;
    return authHeader === expectedAuth;
  }

  /**
   * Xử lý dữ liệu webhook từ SePay
   * @param {Object} webhookData - Dữ liệu từ SePay webhook
   * @returns {Object} Processed webhook data
   */
  processWebhookData(webhookData) {
    try {

      // Lấy nội dung chuyển khoản thực tế - ưu tiên 'content' trước 'description'
      const transferContent = webhookData.content || webhookData.transferContent || webhookData.description || '';
      
      // Trích xuất phần nội dung chuyển khoản thực tế từ chuỗi dài
      // Format thường là: "...95972740539-CAU496550-CHUYEN TIEN-..."
      let actualContent = transferContent;
      
      // Tìm pattern CAU/DH/VOT/GIAY etc + số trong chuỗi
      const contentMatch = transferContent.match(/-([A-Z]{2,4}\d{6,8})-/i);
      if (contentMatch) {
        actualContent = contentMatch[1];
      } else {
        // Fallback: tìm các pattern thông thường
        const patterns = [
          /\b(CAU\d{6,8})\b/i,
          /\b(DH\d{6,8})\b/i,
          /\b(VOT\d{6,8})\b/i,
          /\b(GIAY\d{6,8})\b/i,
          /\b(TUI\d{6,8})\b/i
        ];
        
        for (const pattern of patterns) {
          const match = transferContent.match(pattern);
          if (match) {
            actualContent = match[1];
            break;
          }
        }
      }

      // Format dữ liệu webhook theo cấu trúc chuẩn
      const processedData = {
        transactionId: webhookData.id || webhookData.transaction_id || webhookData.transferId,
        amount: parseFloat(webhookData.amount || webhookData.transferAmount || 0),
        description: actualContent, // Sử dụng nội dung đã trích xuất
        bankAccount: webhookData.account_number || webhookData.accountNumber || this.bankAccount,
        bankName: webhookData.bank || this.bankName,
        transferDate: webhookData.transfer_date || webhookData.transferDate || webhookData.when || new Date(),
        referenceCode: webhookData.reference_code || webhookData.referenceNumber || webhookData.tid,
        status: 'completed', // SePay webhook chỉ bắn khi giao dịch thành công
        // Trích xuất mã đơn hàng từ actual content
        orderId: this.extractOrderIdFromDescription(actualContent),
        rawData: webhookData
      };

      return processedData;
    } catch (error) {
      console.error('Error processing SePay webhook data:', error);
      throw new AppError('Lỗi xử lý dữ liệu webhook', 400);
    }
  }

  /**
   * Trích xuất mã đơn hàng từ nội dung chuyển khoản
   * @param {string} description - Nội dung chuyển khoản
   * @returns {string|null} Order ID hoặc null
   */
  extractOrderIdFromDescription(description) {
    try {
      if (!description) return null;

      // Normalize input - loại bỏ khoảng trắng và chuyển về uppercase
      const normalizedDescription = description.trim().toUpperCase().replace(/\s+/g, '');


      // Tìm pattern DH + UUID (8-4-4-4-12 characters) - dùng normalized description
      const dhUuidMatch = normalizedDescription.match(/DH([A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12})/);
      if (dhUuidMatch) {
        return dhUuidMatch[1].toLowerCase();
      }

      // Tìm pattern DH + chuỗi ký tự bất kỳ (fallback cho UUID không có dấu gạch ngang)
      const dhMatch = normalizedDescription.match(/DH([A-F0-9]{32})/);
      if (dhMatch) {
        // Chuyển UUID không có dấu gạch ngang thành có dấu gạch ngang
        const uuid = dhMatch[1].toLowerCase();
        const formattedUuid = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20,32)}`;
        return formattedUuid;
      }

      // Tìm pattern DH + số (cho numeric order ID hoặc short ID)
      const dhNumericMatch = normalizedDescription.match(/DH(\d+)/);
      if (dhNumericMatch) {
        const numericId = dhNumericMatch[1];
        
        // Return numeric ID, order lookup will be handled in controller
        return numericId;
      }

      // Tìm pattern sản phẩm + số - ưu tiên chuỗi số dài nhất cuối cùng
      // VOT123456 → 123456, VOT2SP123456 → 123456, ABC123DEF456 → 456
      const allNumbers = normalizedDescription.match(/\d+/g);
      if (allNumbers && allNumbers.length > 0) {
        // Lấy chuỗi số dài nhất (thường là shortId)
        const longestNumber = allNumbers.reduce((longest, current) => 
          current.length >= longest.length ? current : longest
        );
        
        // Chỉ chấp nhận nếu có ít nhất 3 chữ số (để handle edge cases)
        if (longestNumber.length >= 3) {
          return longestNumber;
        }
      }

      // Tìm pattern ORDER + UUID - dùng normalized description
      const orderUuidMatch = normalizedDescription.match(/ORDER([A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12})/);
      if (orderUuidMatch) {
        return orderUuidMatch[1].toLowerCase();
      }

      // Kiểm tra xem toàn bộ normalized description có phải là UUID không
      const uuidPattern = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/;
      if (uuidPattern.test(normalizedDescription)) {
        return normalizedDescription.toLowerCase();
      }

      // Nếu toàn bộ normalized description là số (có thể là order ID legacy)
      if (/^\d+$/.test(normalizedDescription)) {
        return normalizedDescription;
      }

      return null;
    } catch (error) {
      console.error('Error extracting order ID:', error);
      return null;
    }
  }

  /**
   * Tạo description dựa trên sản phẩm
   * @param {Array} products - Danh sách sản phẩm
   * @param {string} orderId - ID đơn hàng
   * @returns {string} Description for transfer
   */
  /**
   * Loại bỏ dấu tiếng Việt
   * @param {string} str - Chuỗi có dấu
   * @returns {string} Chuỗi không dấu
   */
  removeVietnameseTones(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  generateProductBasedDescription(products, orderId) {
    try {
      if (!products || products.length === 0) {
        // Fallback to default format
        const shortId = orderId.replace(/-/g, '').replace(/[a-f]/g, '').slice(-6) || Date.now().toString().slice(-6);
        return `DH${shortId}`;
      }

      const shortId = orderId.replace(/-/g, '').replace(/[a-f]/g, '').slice(-6) || Date.now().toString().slice(-6);
      
      // Lấy sản phẩm đầu tiên (chính)
      const mainProduct = products[0];
      let productCode = '';

      if (mainProduct.name) {
        // Loại bỏ dấu và tạo mã sản phẩm từ tên
        const name = this.removeVietnameseTones(mainProduct.name).toUpperCase();
        
        if (name.includes('VOT') || name.includes('RACKET')) {
          productCode = 'VOT';
        } else if (name.includes('GIAY') || name.includes('SHOES')) {
          productCode = 'GIAY';
        } else if (name.includes('AO') || name.includes('SHIRT')) {
          productCode = 'AO';
        } else if (name.includes('QUAN') || name.includes('SHORT')) {
          productCode = 'QUAN';
        } else if (name.includes('TUI') || name.includes('BAG')) {
          productCode = 'TUI';
        } else if (name.includes('PHU KIEN') || name.includes('ACCESSORY')) {
          productCode = 'PK';
        } else {
          // Lấy 3 ký tự đầu của từ đầu tiên (không dấu)
          const words = name.split(' ').filter(word => word.length > 2);
          productCode = words[0] ? words[0].slice(0, 3) : 'SP';
        }
      }

      // Nếu có nhiều sản phẩm
      if (products.length > 1) {
        productCode += `${products.length}SP`; // VD: VOT2SP
      }

      return `${productCode}${shortId}`;
    } catch (error) {
      console.error('Error generating product-based description:', error);
      // Fallback
      const shortId = orderId.replace(/-/g, '').replace(/[a-f]/g, '').slice(-6) || Date.now().toString().slice(-6);
      return `DH${shortId}`;
    }
  }

  /**
   * Tạo thông tin thanh toán hoàn chỉnh
   * @param {Object} params - Payment parameters
   * @param {number} params.amount - Số tiền
   * @param {string} params.orderId - ID đơn hàng
   * @param {string} params.customerName - Tên khách hàng (tùy chọn)
   * @param {Array} params.products - Danh sách sản phẩm (tùy chọn)
   * @returns {Object} Payment info
   */
  createPaymentInfo({ amount, orderId, customerName, products }) {
    try {
      // Tạo description dựa trên sản phẩm
      const description = this.generateProductBasedDescription(products, orderId);
      const qrInfo = this.generateQRCode({ amount, description, orderId });
      
      return {
        ...qrInfo,
        customerName: customerName,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // Hết hạn sau 15 phút
        status: 'pending'
      };
    } catch (error) {
      console.error('SePay createPaymentInfo error:', error);
      throw new AppError('Không thể tạo thông tin thanh toán', 500);
    }
  }

  /**
   * Format số tiền hiển thị
   * @param {number} amount - Số tiền
   * @returns {string} Formatted amount
   */
  formatAmount(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Validate amount
   * @param {number} amount - Số tiền cần validate
   * @returns {boolean} True nếu hợp lệ
   */
  validateAmount(amount) {
    const numAmount = parseFloat(amount);
    return !isNaN(numAmount) && numAmount > 0 && numAmount <= 500000000; // Tối đa 500 triệu
  }

  /**
   * Tạo URL test thanh toán (để test webhook)
   * @param {number} amount - Số tiền test (mặc định 1000)
   * @param {string} orderId - Mã đơn hàng test
   * @returns {Object} Test payment info
   */
  createTestPayment(amount = 1000, orderId = `TEST${Date.now()}`) {
    return this.createPaymentInfo({ amount, orderId, customerName: 'Test User' });
  }
}

module.exports = new SepayService();