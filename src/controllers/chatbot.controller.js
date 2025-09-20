const {
  Product,
  Category,
  Order,
  OrderItem,
  User,
  Cart,
  CartItem,
  sequelize,
} = require('../models');
const { Op } = require('sequelize');
const chatbotService = require('../services/chatbot.service');
const geminiChatbotService = require('../services/geminiChatbot.service');

// Initialize Gemini AI only if API key is available
let genAI = null;
try {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'demo-key') {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (error) {
  console.log('Google Generative AI not available, using fallback responses');
}

class ChatbotController {
  // VẪN ĐANG SỬ DỤNG - Main endpoint xử lý tin nhắn chat với AI (POST /api/chatbot/message)
  async handleMessage(req, res) {
    try {
      // PARSE INPUT: Destructure dữ liệu từ request body
      const { message, userId, sessionId, context = {} } = req.body;
      
      // DEBUG LOG: In thông tin request để debugging (chỉ khi cần)
      console.log('Received chatbot message:', { message, userId, sessionId });

      // VALIDATION: Kiểm tra message không được rỗng hoặc chỉ chứa spaces
      if (!message?.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Message is required',
        });
      }

      // AI PROCESSING: Gửi tin nhắn tới Gemini AI service để xử lý thông minh
      // Pass cả userId, sessionId và context để AI có thể personalize response
      const response = await geminiChatbotService.handleMessage(message, {
        userId,        // ID user để lấy purchase history
        sessionId,     // Session để track conversation flow
        ...context,    // Context từ frontend (currentPage, userAgent, etc.)
      });

      // SUCCESS RESPONSE: Trả về kết quả AI đã xử lý
      res.json({
        status: 'success',
        data: response,  // Contains: {response, products, suggestions, intent}
      });
    } catch (error) {
      // ERROR HANDLING: Log chi tiết lỗi để debugging
      console.error('Chatbot error:', error);
      console.error('Error stack:', error.stack);
      
      // GRACEFUL FAILURE: Trả về response thân thiện thay vì crash
      res.status(500).json({
        status: 'error',
        message: 'Failed to process message',
        data: {
          // Fallback response để user không thấy error message technical
          response:
            'Xin lỗi, tôi đang gặp một chút vấn đề. Vui lòng thử lại sau ít phút nhé! 😅',
          // Provide alternative actions user có thể làm
          suggestions: ['Xem sản phẩm hot', 'Tìm khuyến mãi', 'Liên hệ hỗ trợ'],
        },
      });
    }
  }

  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - Legacy product search logic
  async handleProductSearch(message, intent, userProfile, context) {
    try {
      // STEP 1: Trích xuất tham số tìm kiếm từ natural language
      // VD: "vợt yonex dưới 2 triệu" → {category: "vợt", brand: "yonex", maxPrice: 2000000}
      const searchParams = chatbotService.extractSearchParams(message);

      // STEP 2: Query database với các tham số đã extract
      const products = await this.searchProducts(searchParams);

      // STEP 3: Generate AI response text mô tả kết quả tìm kiếm
      const aiResponse = await this.generateAIResponse(
        `Tìm sản phẩm: ${message}`,
        { products, userProfile, searchParams }  // Context cho AI
      );

      // STEP 4: Format sản phẩm thành product cards cho frontend
      const productCards = products.slice(0, 5).map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        thumbnail: product.thumbnail,
        inStock: product.inStock,
        rating: product.rating || 4.5,  // Default rating nếu chưa có reviews
        // Tính % discount nếu có compareAtPrice (giá gốc)
        discount: product.compareAtPrice
          ? Math.round(
              ((product.compareAtPrice - product.price) /
                product.compareAtPrice) *
                100
            )
          : 0,  // Không sale nếu không có compareAtPrice
      }));

      // RETURN: Structured response với AI text + products + suggestions
      return {
        response: aiResponse,           // AI-generated description
        products: productCards,         // Formatted product list
        suggestions: [                  // Action buttons cho user
          'Xem thêm sản phẩm tương tự',
          'So sánh giá',
          'Xem khuyến mãi',
          'Thêm vào giỏ hàng',
        ],
        actions:                        // Deep-link actions
          products.length > 0
            ? [
                {
                  type: 'view_products',
                  label: `Xem tất cả ${products.length} sản phẩm`,
                  url: `/products?search=${encodeURIComponent(message)}`,  // URL có search query
                },
              ]
            : [],  // Không có action nếu không tìm thấy sản phẩm
      };
    } catch (error) {
      console.error('Product search error:', error);
      throw error;  // Re-throw để caller handle
    }
  }

  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - Legacy recommendation engine
  async handleProductRecommendation(message, intent, userProfile, context) {
    try {
      // PERSONALIZED ENGINE: Lấy gợi ý dựa trên behavioral analysis
      const recommendations =
        await chatbotService.getPersonalizedRecommendations(
          userProfile?.id,    // User ID để phân tích purchase history
          intent.params       // Parameters từ intent (type, limit, etc.)
        );

      // AI RESPONSE: Generate text mô tả lý do gợi ý những sản phẩm này
      const aiResponse = await this.generateAIResponse(
        `Gợi ý sản phẩm: ${message}`,
        { recommendations, userProfile }  // Context để AI personalize response
      );

      // RETURN: Cấu trúc response chuẩn
      return {
        response: aiResponse,         // AI explanation cho recommendations
        products: recommendations,    // Danh sách sản phẩm được gợi ý
        suggestions: [                // Follow-up actions
          'Xem chi tiết sản phẩm',
          'So sánh các sản phẩm',
          'Tìm sản phẩm tương tự',
          'Thêm vào giỏ hàng',
        ],
      };
    } catch (error) {
      console.error('Product recommendation error:', error);
      throw error;
    }
  }

  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - Sales conversion engine với psychology triggers
  async handleSalesPitch(message, intent, userProfile, context) {
    try {
      // DATA COLLECTION: Lấy data cần thiết cho sales pitch
      const bestDeals = await this.getBestDeals();           // Top discount products
      const trendingProducts = await this.getTrendingProducts(); // Popular/featured items

      // PSYCHOLOGY ENGINE: Tạo pitch được personalize theo user profile
      // Sử dụng các techniques: urgency, social proof, value proposition, scarcity
      const personalizedPitch = await chatbotService.generateSalesPitch({
        userProfile,      // User behavior data để chọn pitch type
        message,          // Original message để understand context
        bestDeals,        // Products có discount cao
        trendingProducts, // Products đang hot
        context,          // Time of day, current page, etc.
      });

      // RETURN: High-conversion response với CTA buttons
      return {
        response: personalizedPitch.text,      // AI-crafted sales message
        products: personalizedPitch.products,  // Products phù hợp với pitch
        suggestions: [                         // Action-oriented CTAs
          '💳 Mua ngay - Ưu đãi có hạn!',     // Urgency + convenience
          '🛒 Thêm vào giỏ hàng',              // Low-commitment action
          '💝 Xem thêm khuyến mãi',            // Discount hunting
          '📱 Liên hệ tư vấn',                 // Human support escalation
        ],
        actions: [                             // Deep-link actions với urgency
          {
            type: 'urgent_deals',
            label: '🔥 Ưu đai sắp hết hạn - Mua ngay!',
            url: '/deals',                     // Direct to deals page
          },
          {
            type: 'bestsellers',
            label: '⭐ Sản phẩm bán chạy nhất',
            url: '/bestsellers',              // Social proof page
          },
        ],
      };
    } catch (error) {
      console.error('Sales pitch error:', error);
      throw error;
    }
  }

  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - Order support handler
  async handleOrderInquiry(message, intent, userProfile, context) {
    try {
      // AI SUPPORT: Generate contextual response cho order-related questions
      const aiResponse = await this.generateAIResponse(
        `Hỗ trợ đơn hàng: ${message}`,
        { userProfile }  // User context để personalize support
      );

      // RETURN: Support-focused response với order management actions
      return {
        response: aiResponse,
        suggestions: [                    // Order-related quick actions
          'Kiểm tra trạng thái đơn hàng', // Order tracking
          'Thông tin giao hàng',          // Shipping info
          'Hủy đơn hàng',                 // Order cancellation
          'Liên hệ hỗ trợ',               // Escalate to human support
        ],
      };
    } catch (error) {
      console.error('Order inquiry error:', error);
      throw error;
    }
  }

  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - General customer support handler
  async handleSupport(message, intent, userProfile, context) {
    try {
      // AI SUPPORT: Generate helpful response cho general support questions
      const aiResponse = await this.generateAIResponse(
        `Hỗ trợ khách hàng: ${message}`,
        { userProfile }  // Context để customize support level
      );

      // RETURN: Support-oriented response với policy/help links
      return {
        response: aiResponse,
        suggestions: [               // Common support topics
          'Chính sách đổi trả',     // Return/exchange policy
          'Hướng dẫn mua hàng',     // Purchase guide
          'Thông tin bảo hành',     // Warranty info
          'Liên hệ hotline',        // Direct phone support
        ],
      };
    } catch (error) {
      console.error('Support error:', error);
      throw error;
    }
  }

  // @deprecated - ĐÃ ĐƯỢC THAY THẾ BỞI GEMINI AI - General conversation với sales opportunity detection
  async handleGeneral(message, intent, userProfile, context) {
    try {
      // SALES OPPORTUNITY SCANNER: Luôn tìm cơ hội chuyển đổi conversation thành sales
      const salesOpportunity = await chatbotService.findSalesOpportunity(
        message,      // Scan message cho emotional/situational triggers
        userProfile   // User behavior để assess sales potential
      );

      let response;
      
      // BRANCH 1: Sales opportunity detected → Activate sales mode
      if (salesOpportunity.found) {
        response = await this.handleSalesPitch(
          message,
          salesOpportunity.intent,  // Contains trigger keyword và confidence
          userProfile,
          context
        );
      } else {
        // BRANCH 2: Normal conversation → Still guide toward products
        const aiResponse = await this.generateAIResponse(message, {
          userProfile,  // Context để personalize general response
        });
        
        response = {
          response: aiResponse,
          suggestions: [              // Always suggest product-related actions
            'Tìm sản phẩm hot 🔥',   // Browse popular items
            'Xem khuyến mãi 🎉',     // Check promotions
            'Sản phẩm bán chạy ⭐',  // Social proof products
            'Hỗ trợ mua hàng 💬',    // Purchase assistance
          ],
        };
      }

      return response;
    } catch (error) {
      console.error('General conversation error:', error);
      throw error;
    }
  }

  // VẪN ĐANG SỬ DỤNG - AI-powered product search endpoint (POST /api/chatbot/products/search)
  async aiProductSearch(req, res) {
    try {
      // PARSE PARAMS: Lấy search query và optional parameters
      const { query, userId, limit = 10 } = req.body;

      // VALIDATION: Kiểm tra query không được rỗng
      if (!query?.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required',
        });
      }

      // NLP PROCESSING: Extract structured parameters từ natural language
      // VD: "vợt yonex dưới 2 triệu màu đỏ" → {category: "vợt", brand: "yonex", maxPrice: 2000000, color: "đỏ"}
      const searchParams = chatbotService.extractSearchParams(query);
      
      // DATABASE QUERY: Tìm sản phẩm với parameters đã extract + limit
      const products = await this.searchProducts({ ...searchParams, limit });

      // SUCCESS RESPONSE: Trả về kết quả search structured
      res.json({
        status: 'success',
        data: {
          query,                    // Original search query
          results: products,        // Matching products
          total: products.length,   // Count cho pagination
        },
      });
    } catch (error) {
      console.error('AI product search error:', error);
      // ERROR RESPONSE: Generic error message để không expose system details
      res.status(500).json({
        status: 'error',
        message: 'Search failed',
      });
    }
  }

  // VẪN ĐANG SỬ DỤNG - Personalized recommendation engine (GET /api/chatbot/recommendations)
  async getRecommendations(req, res) {
    try {
      // PARSE PARAMS: Lấy parameters từ query string với defaults
      const { userId, limit = 5, type = 'personal' } = req.query;

      // RECOMMENDATION ENGINE: Gọi service để lấy gợi ý dựa trên behavioral analysis
      // Types: 'personal' (lịch sử), 'trending' (hot), 'similar' (related), 'deals' (giảm giá)
      const recommendations =
        await chatbotService.getPersonalizedRecommendations(userId, {
          type,                     // Loại recommendation algorithm
          limit: parseInt(limit),   // Số lượng sản phẩm trả về
        });

      // SUCCESS RESPONSE: Trả về recommendations với metadata
      res.json({
        status: 'success',
        data: {
          recommendations,  // Array sản phẩm được gợi ý
          type,            // Loại algorithm đã sử dụng
        },
      });
    } catch (error) {
      console.error('Recommendations error:', error);
      // ERROR HANDLING: Generic error response
      res.status(500).json({
        status: 'error',
        message: 'Failed to get recommendations',
      });
    }
  }

  // VẪN ĐANG SỬ DỤNG - Analytics tracking cho chatbot interactions (POST /api/chatbot/analytics)
  async trackAnalytics(req, res) {
    try {
      // PARSE ANALYTICS DATA: Lấy tất cả tracking parameters
      const { event, userId, sessionId, productId, value, metadata } = req.body;

      // TRACK EVENT: Gửi data tới analytics service để lưu/xử lý
      // Events: 'message_sent', 'product_clicked', 'product_added_to_cart', 'purchase_completed'
      await chatbotService.trackAnalytics({
        event,        // Loại event (message_sent, product_clicked, etc.)
        userId,       // ID user để track behavior
        sessionId,    // Chat session để group events
        productId,    // Sản phẩm liên quan (nếu có)
        value,        // Giá trị (price, quantity, etc.)
        metadata,     // Additional data (source: 'chatbot', intent, etc.)
        timestamp: new Date(),  // Thời gian event xảy ra
      });

      // SUCCESS RESPONSE: Confirm tracking thành công
      res.json({
        status: 'success',
        message: 'Analytics tracked successfully',
      });
    } catch (error) {
      console.error('Analytics tracking error:', error);
      // ERROR RESPONSE: Không fail request nếu analytics lỗi
      res.status(500).json({
        status: 'error',
        message: 'Failed to track analytics',
      });
    }
  }

  // VẪN ĐANG SỬ DỤNG - Add product to cart from chat widget (POST /api/chatbot/cart/add)
  async addToCart(req, res) {
    try {
      // PARSE CART DATA: Lấy thông tin sản phẩm cần thêm
      const { productId, variantId, quantity = 1, sessionId } = req.body;
      const userId = req.user.id;  // Từ authenticate middleware

      // CART MANAGEMENT: Tìm hoặc tạo cart cho user
      let cart = await Cart.findOne({ where: { userId } });
      if (!cart) {
        // Tạo cart mới nếu user chưa có
        cart = await Cart.create({ userId });
      }

      // ADD ITEM: Thêm sản phẩm vào cart với variant và quantity
      const cartItem = await CartItem.create({
        cartId: cart.id,  // Liên kết với cart của user
        productId,        // Sản phẩm chính
        variantId,        // Variant (size, màu, etc.) - optional
        quantity,         // Số lượng
      });

      // ANALYTICS TRACKING: Track conversion từ chat → add to cart
      await chatbotService.trackAnalytics({
        event: 'product_added_to_cart',
        userId,
        sessionId,
        productId,
        metadata: { 
          quantity, 
          source: 'chatbot'  // Đánh dấu đây là conversion từ chat
        },
        timestamp: new Date(),
      });

      // SUCCESS RESPONSE: Confirm thêm vào cart thành công
      res.json({
        status: 'success',
        message: 'Product added to cart successfully',
        data: { cartItem },  // Trả về cart item vừa tạo
      });
    } catch (error) {
      console.error('Add to cart error:', error);
      // ERROR RESPONSE: Generic error cho security
      res.status(500).json({
        status: 'error',
        message: 'Failed to add product to cart',
      });
    }
  }

  // VẪN ĐANG SỬ DỤNG - Database search engine với Vietnamese-English keyword mapping
  async searchProducts(searchParams) {
    // BASE QUERY CONDITIONS: Chỉ lấy sản phẩm active và còn hàng
    const where = {
      status: 'active',  // Không lấy draft/disabled products
      inStock: true,     // Chỉ hiển thị sản phẩm còn hàng
    };

    // KEYWORD PROCESSING: Xử lý keyword search với bilingual support
    if (searchParams.keyword) {
      // VIETNAMESE-ENGLISH MAPPING: Cho phép search bằng cả tiếng Việt và English
      const keywordMapping = {
        // Equipment categories
        vợt: ['racket', 'racquet', 'badminton racket'],
        'vợt cầu lông': ['racket', 'racquet', 'badminton racket'],
        giày: ['shoes', 'shoe', 'badminton shoes', 'court shoes'],
        'giày cầu lông': ['badminton shoes', 'court shoes', 'shoes'],
        áo: ['shirt', 'jersey', 'badminton shirt'],
        'áo cầu lông': ['badminton shirt', 'jersey', 'badminton jersey'],
        quần: ['shorts', 'pants', 'badminton shorts'],
        'quần cầu lông': ['badminton shorts', 'shorts'],
        
        // Accessories
        grip: ['grip', 'overgrip', 'handle grip'],
        'cán vợt': ['grip', 'overgrip', 'handle grip'],
        'dây vợt': ['string', 'racket string', 'badminton string'],
        'phụ kiện': ['accessories', 'accessory', 'grip', 'string'],
        
        // Brands (luôn giữ nguyên)
        yonex: ['yonex'],
        victor: ['victor'],
        'li-ning': ['li-ning', 'lining'],
        mizuno: ['mizuno'],
        kawasaki: ['kawasaki'],
      };

      // EXPAND SEARCH TERMS: Từ keyword ban đầu thành mảng các terms
      const originalKeyword = searchParams.keyword.toLowerCase();
      let searchTerms = [originalKeyword];  // Giữ keyword gốc

      // Thêm English equivalents nếu tìm thấy Vietnamese keywords
      Object.keys(keywordMapping).forEach((viKeyword) => {
        if (originalKeyword.includes(viKeyword)) {
          searchTerms = [...searchTerms, ...keywordMapping[viKeyword]];
        }
      });

      // BUILD SEARCH CONDITIONS: Tạo OR conditions cho name và description
      const searchConditions = [];
      searchTerms.forEach((term) => {
        searchConditions.push(
          { name: { [Op.iLike]: `%${term}%` } },        // Tìm trong tên sản phẩm
          { description: { [Op.iLike]: `%${term}%` } }  // Tìm trong mô tả
        );
      });

      where[Op.or] = searchConditions;  // Combine tất cả conditions bằng OR
    }

    // PRICE FILTERING: Thêm điều kiện lọc theo giá
    if (searchParams.minPrice) {
      where.price = { [Op.gte]: searchParams.minPrice };  // Giá >= minPrice
    }

    if (searchParams.maxPrice) {
      where.price = { ...where.price, [Op.lte]: searchParams.maxPrice };  // Giá <= maxPrice
    }

    // CATEGORY FILTERING: TODO - Implement category filter
    if (searchParams.category) {
      // TODO: Add JOIN với categories table để filter theo danh mục
    }

    // DATABASE QUERY: Execute search với tất cả conditions
    const products = await Product.findAll({
      where,                          // Search conditions đã build
      include: [
        {
          model: Category,
          as: 'categories',           // Include category info
          through: { attributes: [] }, // Không lấy data từ junction table
        },
      ],
      limit: searchParams.limit || 20,  // Default 20 sản phẩm
      order: [['createdAt', 'DESC']],   // Sản phẩm mới nhất trước
    });

    return products;
  }

  // VẪN ĐANG SỬ DỤNG - Lấy top deals với discount cao nhất
  async getBestDeals() {
    return await Product.findAll({
      where: {
        status: 'active',                     // Chỉ lấy sản phẩm đang active
        inStock: true,                        // Còn hàng
        compareAtPrice: { [Op.gt]: 0 },      // Phải có giá so sánh (giá gốc) để tính discount
      },
      order: [
        [
          // Sắp xếp theo % discount giảm dần (discount cao nhất trước)
          // Formula: ((giá gốc - giá hiện tại) / giá gốc) * 100%
          sequelize.literal(
            '((compare_at_price - price) / compare_at_price) DESC'
          ),
        ],
      ],
      limit: 10,  // Chỉ lấy 10 deals tốt nhất
    });
  }

  // VẪN ĐANG SỬ DỤNG - Lấy sản phẩm trending (hiện tại dựa trên featured flag)
  async getTrendingProducts() {
    // TODO: Trong tương lai có thể dựa trên:
    // - Order frequency (số lượng bán trong 30 ngày qua)
    // - View count (lượt xem sản phẩm)
    // - Add to cart rate
    // - Search frequency
    
    return await Product.findAll({
      where: {
        status: 'active',   // Sản phẩm đang hoạt động
        inStock: true,      // Còn hàng
        featured: true,     // Được admin đánh dấu là featured/hot
      },
      limit: 10,                      // Lấy 10 sản phẩm trending
      order: [['createdAt', 'DESC']], // Sản phẩm mới featured trước
    });
  }

  // @deprecated - DUPLICATE AI LOGIC - Nên dùng geminiChatbotService thay vì method riêng
  async generateAIResponse(prompt, context = {}) {
    try {
      // CHECK AI AVAILABILITY: Nếu không có Gemini API key thì fallback
      if (!genAI) {
        return this.getTemplateResponse(prompt, context);
      }

      // GEMINI MODEL: Sử dụng cùng model với geminiChatbotService (gemini-2.0-flash)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // PROMPT ENGINEERING: Tạo prompt có sales focus (khác với main service)
      const enhancedPrompt = `
        Bạn là trợ lý bán hàng thông minh của BadmintonShop - một cửa hàng đồ cầu lông trực tuyến.
        Mục tiêu chính của bạn là giúp khách hàng tìm và mua sản phẩm cầu lông phù hợp.
        
        Ngữ cảnh: ${JSON.stringify(context)}    // Context từ deprecated methods
        Câu hỏi khách hàng: ${prompt}            // Prompt khác với main flow
        
        Hãy trả lời một cách:
        - Thân thiện và chuyên nghiệp
        - Tập trung vào việc bán sản phẩm cầu lông
        - Đề xuất vợt, giày, áo quần, phụ kiện cụ thể khi có thể
        - Tư vấn theo trình độ chơi của khách hàng
        - Tạo cảm giác cấp bách để khuyến khích mua hàng      // Sales-focused
        - Sử dụng emoji cầu lông phù hợp (🏸🎯👟)
        
        Độ dài: Khoảng 2-3 câu, ngắn gọn nhưng hiệu quả.   // Ngắn hơn main service
      `;

      // GEMINI API CALL: Gửi request tới Gemini
      const result = await model.generateContent(enhancedPrompt);
      const response = result.response;
      return response.text();  // Raw text response (khác với main service trả JSON)
    } catch (error) {
      console.error('AI response generation error:', error.message || error);
      // FALLBACK: Nếu Gemini fail thì dùng template responses
      return this.getTemplateResponse(prompt, context);
    }
  }

  // VẪN ĐANG SỬ DỤNG - Fallback template responses khi Gemini AI không available
  getTemplateResponse(prompt, context) {
    // TEMPLATE POOL: Mảng các response templates cứng để fallback
    const templates = [
      // Template 1: Hỏi thêm thông tin để tư vấn tốt hơn
      'Tôi hiểu bạn đang tìm kiếm đồ cầu lông phù hợp! 🏸 Để giúp bạn tốt nhất, hãy cho tôi biết thêm về trình độ và sở thích chơi của bạn nhé.',
      
      // Template 2: Giới thiệu sản phẩm categories
      'Chào bạn! 👋 BadmintonShop có rất nhiều sản phẩm cầu lông tuyệt vời. Bạn quan tâm đến vợt, giày hay trang phục nhất?',
      
      // Template 3: Ưu đãi và giá cả competitive
      'Cảm ơn bạn đã quan tâm! 🎯 Tôi sẽ giúp bạn tìm những sản phẩm cầu lông tốt nhất với giá ưu đãi.',
    ];
    
    // RANDOM SELECTION: Chọn ngẫu nhiên 1 template để tránh lặp lại
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // VẪN ĐANG SỬ DỤNG - Simple test endpoint không dùng AI (POST /api/chatbot/simple-message)
  async handleSimpleMessage(req, res) {
    try {
      // PARSE INPUT: Lấy parameters từ request
      const { message, userId, sessionId, context = {} } = req.body;
      
      // DEBUG LOG: Chỉ log trong development environment
      if (process.env.NODE_ENV !== 'production') {
        console.log('Received simple message:', { message, userId, sessionId });
      }

      // VALIDATION: Kiểm tra message required
      if (!message?.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Message is required',
        });
      }

      // SIMPLE RESPONSE: Echo message + giới thiệu (không AI processing)
      const response = {
        // Echo user message + brand introduction
        response: `Chào bạn! Bạn vừa nói: "${message}". Tôi là trợ lý AI chuyên về đồ cầu lông của BadmintonShop! 🏸`,
        
        // Static suggestions cho quick actions
        suggestions: [
          'Tìm vợt cầu lông 🎯',     // Product search
          'Xem giày cầu lông 👟',     // Category browse
          'Khuyến mãi hôm nay 🎉',      // Promotions
          'Tư vấn thiết bị 💡',        // Expert advice
        ],
      };

      // SUCCESS RESPONSE: Trả về simple response
      res.json({
        status: 'success',
        data: response,
      });
    } catch (error) {
      console.error('Simple message error:', error.message || error);
      // ERROR RESPONSE: Generic error handling
      res.status(500).json({
        status: 'error',
        message: 'Failed to process simple message',
      });
    }
  }
}

module.exports = ChatbotController;
