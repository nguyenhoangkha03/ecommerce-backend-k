const { Product, Category, Order, OrderItem, User } = require('../models');
const { Op } = require('sequelize');

class ChatbotService {
  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - Rule-based intent detection (legacy)
  async analyzeIntent(message) {
    // Normalize input để pattern matching case-insensitive
    const lowerMessage = message.toLowerCase();

    // INTENT 1: Product Search Detection
    // Detect keywords indicating user wants to search/buy products
    if (this.matchesPatterns(lowerMessage, [
      'tìm', 'kiếm', 'search',     // Search verbs (tìm kiếm)
      'mua', 'cần', 'muốn',        // Purchase intent (ý định mua)
      'có', 'bán', 'shop', 'store', // Availability queries (hỏi có bán không)
      'sản phẩm',                  // Direct product mention
    ])) {
      return {
        type: 'product_search',
        confidence: 0.8,                                    // 80% confidence cho rule-based
        params: this.extractSearchParams(message),          // Extract chi tiết tìm kiếm
      };
    }

    // INTENT 2: Product Recommendation Detection
    // User asking for suggestions/advice on what to buy
    if (this.matchesPatterns(lowerMessage, [
      'gợi ý', 'đề xuất', 'recommend', 'tư vấn',    // Direct recommendation requests
      'nên mua', 'phù hợp',                         // Suitability questions
      'hot', 'trend', 'bán chạy', 'mới',           // Trending/popular requests
    ])) {
      return {
        type: 'product_recommendation',
        confidence: 0.9,                            // 90% confidence - clear intent
        params: { type: 'general' },                // Default to general recommendations
      };
    }

    // INTENT 3: Sales Opportunity Detection  
    // Price inquiries and shopping-related questions
    if (this.matchesPatterns(lowerMessage, [
      'giá', 'bao nhiêu', 'cost', 'price', 'tiền', // Price queries
      'rẻ', 'đắt',                                  // Price comparisons
      'sale', 'giảm giá', 'khuyến mãi',            // Discount hunting
    ])) {
      return {
        type: 'sales_pitch',
        confidence: 0.9,                            // High confidence - strong buying signal
        params: { focus: 'pricing' },               // Focus on price-based pitch
      };
    }

    // INTENT 4: Order Inquiry Detection
    // Questions about orders, payment, shipping
    if (this.matchesPatterns(lowerMessage, [
      'đơn hàng', 'order', 'mua hàng',              // Order-related terms
      'thanh toán',                                 // Payment inquiries  
      'ship', 'giao hàng', 'delivery',             // Shipping questions
    ])) {
      return {
        type: 'order_inquiry',
        confidence: 0.7,                            // Medium confidence - could be general questions
        params: {},                                 // No specific params needed
      };
    }

    // INTENT 5: Support Request Detection
    // Help requests, issues, returns, warranty
    if (this.matchesPatterns(lowerMessage, [
      'hỗ trợ', 'help', 'support',                 // General help requests
      'lỗi', 'problem',                            // Problem reports
      'đổi trả', 'return', 'refund',               // Return/refund requests
      'bảo hành',                                   // Warranty inquiries
    ])) {
      return {
        type: 'support',
        confidence: 0.8,                            // High confidence - clear support intent
        params: {},                                 // No specific params needed
      };
    }

    // DEFAULT: General conversation (không match intent nào cả)
    return {
      type: 'general',
      confidence: 0.5,                              // Low confidence - unknown intent
      params: {},                                   // No params
    };
  }

  // VẪN ĐANG SỬ DỤNG - Natural Language Parameter Extractor cho product search
  extractSearchParams(message) {
    // Normalize input cho pattern matching
    const lowerMessage = message.toLowerCase();
    const params = {}; // Object chứa các tham số đã extract

    // CATEGORY EXTRACTION: Phân tích loại sản phẩm từ keywords
    // Vietnamese-English mapping cho domain cầu lông
    const categoryKeywords = {
      // Core products
      vợt: ['vợt', 'racket', 'racquet', 'vot'],
      giày: ['giày', 'shoes', 'shoe', 'giay cau long', 'badminton shoes'],
      áo: ['áo', 'shirt', 'jersey', 'áo cầu lông', 'badminton shirt'],
      quần: ['quần', 'shorts', 'pants', 'quần cầu lông', 'badminton shorts'],
      
      // Accessories & specialized items
      'phụ kiện': ['phụ kiện', 'accessories', 'grip', 'overgrip', 'cán vợt', 'dây vợt', 'string'],
      'giày cầu lông': ['giày cầu lông', 'badminton shoes', 'giày thể thao'],
      'áo cầu lông': ['áo cầu lông', 'badminton jersey', 'áo thể thao'],
      'quần cầu lông': ['quần cầu lông', 'badminton shorts', 'quần thể thao'],
      'dây vợt': ['dây vợt', 'string', 'racket string', 'cước vợt'],
      'cán vợt': ['cán vợt', 'grip', 'handle grip', 'overgrip'],
    };

    // Scan message cho category keywords (first match wins)
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        params.category = category;
        break; // Stop tại match đầu tiên để tránh conflict
      }
    }

    // PRICE EXTRACTION: Parse giá từ natural language
    // Regex tìm numbers + units: "2triệu", "500k", "1000000"
    const priceMatch = lowerMessage.match(/(\d+)(?:k|000|triệu)?/g);
    if (priceMatch) {
      // Normalize tất cả prices về VND
      const prices = priceMatch.map(p => {
        if (p.includes('k')) return parseInt(p) * 1000;          // "500k" → 500000
        if (p.includes('triệu')) return parseInt(p) * 1000000;   // "2triệu" → 2000000  
        return parseInt(p);                                      // "1500000" → 1500000
      });

      // Detect price range context từ natural language
      if (lowerMessage.includes('dưới') || lowerMessage.includes('under')) {
        params.maxPrice = Math.max(...prices);     // "dưới 2 triệu" → maxPrice: 2000000
      } else if (lowerMessage.includes('trên') || lowerMessage.includes('over')) {
        params.minPrice = Math.min(...prices);     // "trên 500k" → minPrice: 500000
      }
      // Note: Nếu không có context words, prices sẽ bị ignore (ambiguous)
    }

    // Trích xuất màu sắc
    const colors = ['đỏ', 'xanh', 'đen', 'trắng', 'vàng', 'hồng', 'nâu', 'xám'];
    for (const color of colors) {
      if (lowerMessage.includes(color)) {
        params.color = color;
        break;
      }
    }

    // Trích xuất thương hiệu
    const brands = ['yonex', 'victor', 'lining', 'mizuno', 'kawasaki', 'kumpoo', 'apacs', 'fleet', 'forza'];
    for (const brand of brands) {
      if (lowerMessage.includes(brand)) {
        params.brand = brand;
        break;
      }
    }

    // Trích xuất từ khóa chung
    params.keyword = message;

    return params;
  }

  // VẪN ĐANG SỬ DỤNG - Phân tích profile từ lịch sử mua hàng để cá nhân hóa gợi ý
  async getUserProfile(userId) {
    try {
      // Query user với nested relations: User → Orders → OrderItems → Products
      // Chỉ lấy 10 đơn hàng gần nhất để tối ưu performance
      const user = await User.findByPk(userId, {
        include: [
          {
            model: Order,
            as: 'orders',
            attributes: ['id', 'number', 'status', 'total', 'createdAt'], // Explicit attributes để tránh lỗi
            include: [
              {
                model: OrderItem,
                as: 'items',
                attributes: ['id', 'productId', 'quantity', 'price', 'name'], // Explicit attributes
                include: [
                  {
                    model: Product, // Lấy thông tin sản phẩm để phân tích category & giá
                    attributes: ['id', 'name', 'price'], // Chỉ lấy fields cần thiết
                    required: false, // LEFT JOIN để không bỏ qua items có product bị deleted
                    include: [
                      {
                        model: Category,
                        as: 'categories',
                        attributes: ['id', 'name'],
                        through: { attributes: [] }, // Không lấy data từ junction table
                        required: false,
                      },
                    ],
                  },
                ],
              },
            ],
            limit: 10, // Giới hạn 10 đơn gần nhất (đủ để phân tích pattern)
            order: [['createdAt', 'DESC']], // Ưu tiên đơn hàng mới nhất
          },
        ],
      });

      // Nếu user không tồn tại hoặc chưa từng mua hàng
      if (!user) {
        console.log(`🚫 [DEBUG] User not found: ${userId}`);
        return null;
      }

      // Debug: Log raw user data
      console.log(`📊 [DEBUG] User found: ${user.name} (${user.email})`);
      console.log(`📊 [DEBUG] Orders count: ${user.orders?.length || 0}`);
      user.orders?.forEach((order, i) => {
        console.log(`📊 [DEBUG] Order ${i+1}: ${order.items?.length || 0} items`);
      });

      // Khởi tạo data structures để phân tích behavior
      const purchaseHistory = [];      // Mảng tất cả sản phẩm đã mua (để tránh gợi ý duplicate)
      const categoryPreferences = {};  // Object đếm số lần mua theo category
      const priceRange = { min: Infinity, max: 0 }; // Tracking khoảng giá user hay mua

      // Duyệt qua tất cả orders và items để thu thập dữ liệu
      user.orders?.forEach((order) => {
        order.items?.forEach((item) => {
          if (item.Product) {
            // Debug: Log found product
            console.log(`✅ [DEBUG] Found product: ${item.Product.name} (ID: ${item.Product.id})`);
            
            // Thu thập vào purchase history (dùng để avoid duplicate recommendations)
            purchaseHistory.push(item.Product);

            // Phân tích sở thích category: đếm số lần mua từng loại sản phẩm
            // VD: "VỢT CẦU LÔNG": 3, "GIÀY CẦU LÔNG": 1 → user thích vợt hơn giày
            item.Product.categories?.forEach((cat) => {
              categoryPreferences[cat.name] = (categoryPreferences[cat.name] || 0) + 1;
            });

            // Tracking price range: sử dụng item.price (giá variant) thay vì Product.price (giá gốc = 0)
            // item.price chứa giá thực tế của variant khi đặt hàng
            if (item.price < priceRange.min) priceRange.min = parseFloat(item.price);
            if (item.price > priceRange.max) priceRange.max = parseFloat(item.price);
          }
        });
      });

      // Debug: Log final results
      console.log(`🎯 [DEBUG] Purchase History: ${purchaseHistory.length} products`);
      console.log(`🎯 [DEBUG] Category Preferences:`, categoryPreferences);
      console.log(`🎯 [DEBUG] Price Range:`, priceRange.min === Infinity ? null : priceRange);

      // Tạo user profile object với computed metrics
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        purchaseHistory,                                        // Array sản phẩm đã mua
        categoryPreferences,                                    // Object: {"VỢT CẦU LÔNG": 3, "GIÀY": 1}
        priceRange: priceRange.min === Infinity ? null : priceRange, // {min: 200000, max: 2000000} hoặc null
        orderCount: user.orders?.length || 0,                  // Tổng số đơn hàng
        isVip: (user.orders?.length || 0) >= 5,               // VIP nếu >= 5 đơn hàng
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // VẪN ĐANG SỬ DỤNG - Engine gợi ý sản phẩm dựa trên behavioral analysis
  async getPersonalizedRecommendations(userId, params = {}) {
    try {
      // Parse input params với default values
      const { type = 'personal', limit = 5 } = params;
      let products = [];

      // CHẾ ĐỘ 1: Personal recommendations (dựa trên lịch sử mua hàng)
      if (type === 'personal' && userId) {
        // Lấy user profile đã được phân tích từ getUserProfile()
        const userProfile = await this.getUserProfile(userId);

        // Nếu user có lịch sử mua hàng → dùng category preferences để gợi ý
        if (userProfile?.categoryPreferences) {
          // Extract các category user đã từng mua (sorted by frequency)
          // VD: ["VỢT CẦU LÔNG", "GIÀY CẦU LÔNG", "ÁO CẦU LÔNG"]
          const preferredCategories = Object.keys(userProfile.categoryPreferences);
          
          // Query sản phẩm thuộc categories user yêu thích
          products = await Product.findAll({
            where: {
              status: 'active',     // Chỉ lấy sản phẩm active
              inStock: true,        // Còn hàng
            },
            // JOIN với categories để filter theo user preferences
            include: [
              {
                model: Category,
                as: 'categories',
                where: {
                  name: { [Op.in]: preferredCategories }, // Chỉ lấy categories user đã mua
                },
                through: { attributes: [] }, // Không lấy data từ junction table
              },
            ],
            limit: limit * 2, // Lấy gấp đôi để có buffer cho việc filter duplicate
            order: [['createdAt', 'DESC']], // Ưu tiên sản phẩm mới nhất
          });

          // ANTI-DUPLICATE FILTER: Loại bỏ sản phẩm user đã mua để tránh gợi ý lại
          const purchasedProductIds = userProfile.purchaseHistory.map(p => p.id);
          products = products.filter(p => !purchasedProductIds.includes(p.id));
        }
      }

      // CHẾ ĐỘ 2: Fallback recommendations (khi không đủ personal data)
      // Nếu personal recommendations không đủ → lấy thêm fallback products
      if (products.length < limit) {
        const remainingSlots = limit - products.length; // Số slot còn thiếu
        
        const fallbackProducts = await Product.findAll({
          where: {
            status: 'active',
            inStock: true,
            [Op.or]: [
              { featured: true },                        // Sản phẩm featured (do admin chọn)
              { compareAtPrice: { [Op.gt]: 0 } },        // Sản phẩm đang sale (có giá so sánh)
            ],
          },
          limit: remainingSlots,                         // Chỉ lấy đúng số lượng còn thiếu
          order: [
            ['featured', 'DESC'],                        // Ưu tiên featured trước
            ['createdAt', 'DESC'],                       // Rồi đến sản phẩm mới
          ],
        });

        // Merge personal + fallback products
        products = [...products, ...fallbackProducts];
      }

      // FORMATTER: Transform database objects thành format cho frontend
      return products.slice(0, limit).map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        thumbnail: product.thumbnail,
        inStock: product.inStock,
        rating: 4.5, // TODO: Tính từ bảng reviews thật
        discount: product.compareAtPrice                 // Tính % discount nếu có compareAtPrice
          ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
          : 0,                                           // Không có compareAtPrice = không sale
      }));
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  }

  // VẪN ĐANG SỬ DỤNG - Engine tạo lời mời bán hàng theo tâm lý khách hàng 💰
  async generateSalesPitch({
    userProfile,
    message,
    bestDeals,
    trendingProducts,
    context,
  }) {
    try {
      // Lấy tất cả template messages cho các loại pitch khác nhau
      const templates = this.getSalesPitchTemplates();
      
      // Chọn loại pitch phù hợp dựa trên profile và context
      const pitchType = this.selectPitchType(userProfile, message, context);

      // Khởi tạo pitch text từ template và mảng products trống
      let pitch = templates[pitchType];
      let products = [];

      // LOGIC PITCH: Customize theo từng loại tâm lý khách hàng
      switch (pitchType) {
        case 'urgency':  // Tạo áp lực thời gian "chỉ còn vài giờ!"
          products = bestDeals.slice(0, 3);  // Lấy 3 deals tốt nhất
          // Replace placeholder {discount} bằng % discount thật của sản phẩm đầu tiên
          pitch = pitch.replace('{discount}', products[0]?.discount || '50%');
          break;

        case 'personal': // Cá nhân hóa theo tên và lịch sử mua hàng
          // Gọi AI engine để lấy gợi ý dựa trên behavioral analysis
          products = await this.getPersonalizedRecommendations(
            userProfile?.id,
            { limit: 3 }  // Chỉ cần 3 sản phẩm cho pitch
          );
          // Replace placeholder {name} bằng tên thật hoặc "bạn" nếu anonymous
          pitch = pitch.replace('{name}', userProfile?.name || 'bạn');
          break;

        case 'social_proof': // Sử dụng tâm lý đám đông "nhiều người đang mua"
          products = trendingProducts.slice(0, 3);  // Sản phẩm hot trend
          // Không cần replace gì, message đã complete
          break;

        case 'value': // Nhấn mạnh tiết kiệm tiền "tiết kiệm tới X đồng"
          products = bestDeals.slice(0, 3);  // Deals có discount cao nhất
          // Tính tổng số tiền user có thể tiết kiệm từ 3 deals
          const totalSavings = products.reduce(
            (sum, p) => sum + (p.compareAtPrice - p.price),  // comparePrice - price = số tiền save
            0  // Initial value
          );
          // Replace {savings} bằng format VND (2.000.000₫)
          pitch = pitch.replace('{savings}', this.formatPrice(totalSavings));
          break;

        default:  // Fallback: Mix giữa deals và trending
          products = [
            ...bestDeals.slice(0, 2),      // 2 deals tốt
            ...trendingProducts.slice(0, 1), // 1 trending product
          ];
      }

      // Return structured response cho controller
      return {
        text: pitch,        // Message đã được customize
        products,          // Array sản phẩm phù hợp với pitch type
        type: pitchType,   // Loại pitch để frontend có thể style khác nhau
      };
    } catch (error) {
      console.error('Error generating sales pitch:', error);
      // ERROR FALLBACK: Trả về generic pitch để không break user experience
      return {
        text: '🌟 Chúng tôi có nhiều sản phẩm tuyệt vời đang được khuyến mãi! Bạn có muốn xem không?',
        products: bestDeals.slice(0, 3),  // Fallback sang bestDeals
        type: 'fallback',                 // Mark as fallback cho debugging
      };
    }
  }

  // VẪN ĐANG SỬ DỤNG - Detector tìm cơ hội bán hàng từ emotional & situational cues
  async findSalesOpportunity(message, userProfile) {
    // Chuẩn hóa message để pattern matching case-insensitive
    const lowerMessage = message.toLowerCase();

    // TRIGGER KEYWORDS: Phân tích tâm lý và tình huống để tìm cơ hội sales
    const salesKeywords = [
      // EMOTIONAL TRIGGERS - Tình trạng cảm xúc cần "shopping therapy"
      'chán', 'buồn', 'stress', 'mệt',           // Negative emotions → retail therapy
      
      // TIME-BASED TRIGGERS - Thời điểm user có thời gian rảnh shopping  
      'cuối tuần', 'weekend', 'rảnh',            // Free time → browsing/buying opportunity
      
      // DIRECT SHOPPING INTENT - User đã có ý định chi tiền
      'shopping', 'mua sắm', 'tiền',             // Clear purchasing intent
      
      // SOCIAL EVENT TRIGGERS - Cần sản phẩm cho events/occasions
      'sinh nhật', 'party', 'date',              // Need new outfit/accessories
      
      // WORK/LIFE SITUATION TRIGGERS - Professional/personal needs
      'work', 'công việc', 'interview',          // Professional appearance needs
    ];

    // SCAN MESSAGE: Tìm kiếm trigger keywords trong user input
    const opportunity = salesKeywords.find(keyword => lowerMessage.includes(keyword));

    // OPPORTUNITY FOUND: User có potential mua hàng
    if (opportunity) {
      return {
        found: true,                              // Flag: có cơ hội bán hàng
        intent: {
          type: 'sales_pitch',                    // Switch sang sales mode
          confidence: 0.7,                        // 70% confidence từ rule-based detection
          params: { trigger: opportunity },       // Log keyword nào trigger để analytics
        },
      };
    }

    // NO OPPORTUNITY: Tin nhắn bình thường, không có sales trigger
    return { found: false };
  }

  // @deprecated - CHỨC NĂNG KHÔNG HOÀN CHỈNH - Placeholder cho conversation analytics
  async trackConversation(data) {
    try {
      // HIỆN TẠI: Chỉ log ra console, không persistence vào database
      // TODO: Implement ChatbotConversation model để lưu:
      // - userId, message, intent, products, timestamp, sessionId, response
      console.log('Tracking conversation:', {
        userId: data.userId,           // ID user để phân tích behavior
        message: data.message,         // Input message từ user
        intent: data.intent,           // AI detected intent
        products: data.products?.length || 0,  // Số sản phẩm được recommend
        timestamp: data.timestamp,     // Thời gian để tracking session
      });

      // FUTURE: Có thể save vào ChatbotConversation table để:
      // - Phân tích conversation patterns
      // - Improve AI responses qua machine learning
      // - Track conversion rate từ chat → purchase
      // - A/B testing các response templates
    } catch (error) {
      console.error('Error tracking conversation:', error);
    }
  }

  // VẪN ĐANG SỬ DỤNG - Analytics tracker cho chatbot events
  async trackAnalytics(data) {
    try {
      // HIỆN TẠI: Console log cho debugging (production sẽ tắt)
      // TODO: Implement ChatbotAnalytics model để persistence
      console.log('Tracking analytics:', data);

      // FUTURE: Save vào analytics table với các events:
      // - message_sent: User gửi tin nhắn
      // - product_clicked: Click vào sản phẩm từ chat
      // - product_added_to_cart: Add to cart từ chat widget
      // - purchase_completed: Hoàn thành mua hàng từ chat flow
      // - session_started/ended: Tracking session duration
      // 
      // Data structure example:
      // {
      //   event: 'product_clicked',
      //   userId: 'user123',
      //   sessionId: 'session456', 
      //   productId: 'prod789',
      //   value: 1500000, // Price of product
      //   metadata: { source: 'chatbot', intent: 'product_search' },
      //   timestamp: '2024-01-15T10:30:00Z'
      // }
    } catch (error) {
      console.error('Error tracking analytics:', error);
    }
  }

  // VẪN ĐANG SỬ DỤNG - Helper method cho pattern matching trong intent analysis
  matchesPatterns(text, patterns) {
    // Kiểm tra xem text có chứa bất kỳ pattern nào trong mảng patterns không
    return patterns.some((pattern) => text.includes(pattern));
  }

  // VẪN ĐANG SỬ DỤNG - Template library cho các loại sales pitch khác nhau
  getSalesPitchTemplates() {
    return {
      // URGENCY PITCH: Tạo áp lực thời gian để push conversion
      urgency:
        '⏰ CẢNH BÁO: Chỉ còn vài giờ để nhận ưu đãi {discount}! Đừng bỏ lỡ cơ hội này nhé! 🔥',
      
      // PERSONAL PITCH: Cá nhân hóa theo tên và behavioral data
      personal:
        'Chào {name}! 😊 Dựa trên sở thích của bạn, tôi có một vài sản phẩm tuyệt vời muốn giới thiệu!',
      
      // SOCIAL PROOF: Sử dụng tâm lý đám đông "người khác đang mua"
      social_proof:
        '🌟 Những sản phẩm này đang được rất nhiều khách hàng yêu thích và mua! Bạn cũng thử xem nhé!',
      
      // VALUE PROPOSITION: Nhấn mạnh savings/benefit để justify purchase
      value:
        '💎 Cơ hội tuyệt vời! Bạn có thể tiết kiệm tới {savings} với các deal hôm nay!',
      
      // SCARCITY: Tạo cảm giác khan hiếm "số lượng có hạn"
      scarcity:
        '⚡ Chỉ còn số lượng có hạn! Nhiều khách hàng đang quan tâm đến những sản phẩm này!',
      
      // SEASONAL: Tie-in với mùa/events để tạo relevance
      seasonal:
        '🎉 Ưu đãi đặc biệt mùa này! Đây là thời điểm tốt nhất để shopping đấy!',
    };
  }

  // VẪN ĐANG SỬ DỤNG - Smart pitch type selector dựa trên user profile & context
  selectPitchType(userProfile, message, context) {
    const lowerMessage = message.toLowerCase();

    // RULE 1: VIP users get personal treatment (highest priority)
    if (userProfile?.isVip) return 'personal';
    
    // RULE 2: Price-sensitive users get value proposition
    if (lowerMessage.includes('giá') || lowerMessage.includes('rẻ'))
      return 'value';
    
    // RULE 3: Trend-seekers get social proof
    if (lowerMessage.includes('hot') || lowerMessage.includes('trend'))
      return 'social_proof';
    
    // RULE 4: Evening users get urgency (people shop more at night)
    if (context.timeOfDay === 'evening') return 'urgency';

    // FALLBACK: Random selection để avoid predictability
    const types = ['urgency', 'social_proof', 'value', 'scarcity'];
    return types[Math.floor(Math.random() * types.length)];
  }

  // VẪN ĐANG SỬ DỤNG - Vietnamese currency formatter
  formatPrice(price) {
    // Format number theo chuẩn Vietnamese: 2.000.000₫
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',  // Add currency symbol
      currency: 'VND',    // Vietnamese Dong
    }).format(price);
  }
}

module.exports = new ChatbotService();
