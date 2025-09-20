const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Product, Category, sequelize } = require('../models');
const { Op } = require('sequelize');
const { extractSkillLevel, extractKeySpecs } = require('../utils/badmintonRecommendationHelpers');

class GeminiChatbotService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.initializeGemini();
  }

  initializeGemini() {
    try {
      if (
        process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'demo-key'
      ) {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
        });
        console.info(
          '✅ Gemini AI initialized successfully with model: gemini-2.0-flash'
        );
      } else {
        console.warn('⚠️  Gemini API key not found, using fallback responses');
      }
    } catch (error) {
      console.error(
        '❌ Failed to initialize Gemini AI:',
        error.message || error
      );
    }
  }

  /**
   * Main chatbot handler with AI intelligence
   */
  async handleMessage(message, context = {}) {
    try {
      // Step 1: Get all available products from database
      const allProducts = await this.getAllProducts();
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📦 Found ${allProducts.length} products in database`);
      }

      // Step 2: Get user profile for anti-duplicate filtering
      let userProfile = null;
      if (context.userId) {
        const chatbotService = require('./chatbot.service');
        userProfile = await chatbotService.getUserProfile(context.userId);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🧪 [DEBUG] Getting user profile for userId: ${context.userId}`);
          console.log(`🧪 [DEBUG] UserProfile result:`, {
            hasUserProfile: !!userProfile,
            purchaseHistoryCount: userProfile?.purchaseHistory?.length || 0
          });
        }
      }

      // Step 3: Use Gemini AI to understand user intent and find matching products
      const aiResponse = await this.getAIResponse(
        message,
        allProducts,
        context,
        userProfile
      );

      return aiResponse;
    } catch (error) {
      console.error('Gemini chatbot error:', error);
      
      // Try cache as fallback when Gemini fails
      const cachedFallback = await chatKnowledgeCache.findSimilarQuestion(message, 0.5); // Lower threshold for fallback
      if (cachedFallback) {
        console.log('🆘 Using cached fallback with similarity:', cachedFallback.similarity.toFixed(3));
        const parsedResponse = this.parseAIResponse(cachedFallback.record.geminiResponse);
        parsedResponse.source = 'cache_fallback';
        parsedResponse.message = '⚡ Phản hồi từ bộ nhớ đệm (mạng không ổn định)';
        return parsedResponse;
      }
      
      return await this.getFallbackResponse(message);
    }
  }

  /**
   * Get AI response using Gemini
   */
  async getAIResponse(userMessage, products, context, userProfile) {
    const lowerMessage = userMessage.toLowerCase();
    
    // Check for deals/promotion queries first (before AI processing)
    if (
      lowerMessage.includes('khuyến mãi') ||
      lowerMessage.includes('giảm giá') ||
      lowerMessage.includes('sale') ||
      lowerMessage.includes('promotion') ||
      lowerMessage.includes('deal') ||
      lowerMessage.includes('ưu đãi')
    ) {
      return await this.getDealsProducts(userProfile);
    }

    // Check for policy queries (no product suggestions needed)
    if (
      lowerMessage.includes('đổi trả') ||
      lowerMessage.includes('bảo hành') ||
      lowerMessage.includes('chính sách') ||
      lowerMessage.includes('policy') ||
      lowerMessage.includes('return')
    ) {
      return {
        response: '📋 **Chính sách BadmintonShop:**\n\n• **Đổi trả:** Trong 7 ngày nếu sản phẩm còn nguyên tem, chưa sử dụng\n• **Bảo hành:** Theo chính sách nhà sản xuất (6-12 tháng)\n• **Miễn phí ship:** Đơn hàng từ 500k trở lên\n• **Hỗ trợ 24/7:** Hotline và chat online\n• **Đổi size:** Miễn phí đổi size trong 3 ngày\n\nBạn cần tư vấn thêm về chính sách nào không? 😊',
        products: [], // No products for policy queries
        suggestions: [
          'Cách đổi trả sản phẩm',
          'Phí vận chuyển', 
          'Thời gian giao hàng',
          'Liên hệ hỗ trợ',
        ],
        intent: 'policy',
      };
    }

    if (!this.model) {
      return await this.getFallbackResponse(userMessage);
    }

    try {
      // Create a comprehensive prompt for Gemini
      const prompt = this.createPrompt(userMessage, products, context, userProfile);
      if (process.env.NODE_ENV !== 'production') {
        console.log('🤖 Sending request to Gemini API...');
        if (userProfile?.purchaseHistory?.length > 0) {
          console.log('🚫 Purchase history included in prompt:', userProfile.purchaseHistory.map(p => p.name));
        } else {
          console.log('⚠️  No purchase history available');
        }
      }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const aiText = response.text();

      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Received response from Gemini API');
        console.log('📝 AI Response length:', aiText.length);
      }

      // Parse AI response to extract product recommendations
      const parsedResponse = await this.parseAIResponse(aiText, products, userProfile, userMessage);

      return parsedResponse;
    } catch (error) {
      console.error('❌ Gemini API error details:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
      });

      // Check if it's a 404 error specifically
      if (error.message && error.message.includes('404')) {
        console.error(
          '🚨 404 Error - Model not found or API endpoint incorrect'
        );
      }

      return await this.getFallbackResponse(userMessage);
    }
  }

  /**
   * Create comprehensive prompt for Gemini AI
   */
  createPrompt(userMessage, products, context, userProfile) {
    const productList = products
      .map((p) => {
        // Lấy giá từ variant nếu product.price = 0
        let displayPrice = parseFloat(p.price) || 0;
        if (displayPrice === 0 && p.variants?.length > 0) {
          const defaultVariant = p.variants.find(v => v.isDefault) || p.variants[0];
          displayPrice = parseFloat(defaultVariant.price) || 0;
        }
        
        // ✅ THÊM: Extract specifications for better AI understanding
        const skillLevel = extractSkillLevel(p);
        const keySpecs = extractKeySpecs(p);
        const specText = `[Trình độ: ${skillLevel}, Độ cứng: ${keySpecs.flexibility || 'medium'}]`;
        
        return `- ${p.name}: ${p.shortDescription} ${specText} (Giá: ${displayPrice.toLocaleString('vi-VN')}₫)`;
      })
      .join('\n');

    // 🐛 DEBUG: Log product list sent to AI
    if (process.env.NODE_ENV !== 'production') {
      console.log('🤖 PRODUCT LIST SENT TO AI:');
      console.log(productList);
      console.log('📊 Product count by category:');
      const rackets = products.filter(p => /(vợt|racket)/i.test(p.name));
      const shoes = products.filter(p => /(giày|shoes)/i.test(p.name));
      console.log(`  - Vợt: ${rackets.length} | Giày: ${shoes.length}`);
      if (rackets.length > 0) {
        console.log('  - Danh sách vợt:');
        rackets.forEach(r => {
          const skillLevel = extractSkillLevel(r);
          console.log(`    * ${r.name} [${skillLevel}]`);
        });
      }
    }

    return `
Bạn là một trợ lý AI thông minh cho cửa hàng đồ cầu lông BadmintonShop. Bạn có thể xử lý mọi loại câu hỏi:

KHẢ NĂNG CỦA BẠN:
1. Tìm kiếm và gợi ý sản phẩm cầu lông
2. Trả lời câu hỏi về chính sách, dịch vụ
3. Hỗ trợ khách hàng với mọi thắc mắc
4. Tư vấn về thiết bị cầu lông và kỹ thuật
5. Xử lý khiếu nại và phản hồi
6. Trò chuyện thân thiện, tự nhiên
7. Trả lời câu hỏi kiến thức chung một cách thông minh và hài hước

DANH SÁCH SẢN PHẨM CÓ SẴN:
${productList}

THÔNG TIN CỬA HÀNG:
- Tên: BadmintonShop - Cửa hàng đồ cầu lông trực tuyến
- Chuyên: Vợt cầu lông, giày cầu lông, áo quần thể thao, phụ kiện (grip, dây vợt, cước...)
- Thương hiệu: Yonex, Victor, Li-Ning, Mizuno, Kawasaki, Kumpoo, Apacs, Fleet, Forza
- Chính sách: Đổi trả trong 7 ngày, miễn phí vận chuyển đơn >500k
- Thanh toán: COD, chuyển khoản, thẻ tín dụng
- Giao hàng: 1-3 ngày trong nội thành, 3-7 ngày ngoại thành  
- Hỗ trợ: 24/7 qua chat, hotline: 1900-xxxx

TIN NHẮN KHÁCH HÀNG: "${userMessage}"
CONTEXT: ${JSON.stringify(context)}

${userProfile?.purchaseHistory?.length > 0 ? `
🚫 SAN PHẨM KHÁCH HÀNG ĐÃ MUA (KHÔNG được mention hoặc gợi ý):
${userProfile.purchaseHistory.map(p => `- ${p.name} (đã mua)`).join('\n')}
** QUAN TRỌNG: TUYỆT ĐỐI không được nhắc đến, gợi ý, hoặc đưa vào danh sách các sản phẩm trên vì khách hàng đã sở hữu rồi. Hãy tập trung vào các sản phẩm KHÁC phù hợp. **
` : ''}

HƯỚNG DẪN TRẢ LỜI:
🔥 CATEGORY MATCHING - TUÂN THỦ NGHIÊM NGẶT:
- ❗ VỢT CẦU LÔNG: Chỉ khi nào khách hàng nói "vợt", "racket", "cần" → CHỈ được nhắc tên các sản phẩm có từ "VỢT" trong tên
- ❗ GIÀY CẦU LÔNG: Chỉ khi nào khách hàng nói "giày", "shoes" → CHỈ được nhắc tên các sản phẩm có từ "GIÀY" trong tên  
- ❗ TUYỆT ĐỐI KHÔNG gợi ý sản phẩm khác category: Không được gợi ý giày khi hỏi vợt, không được gợi ý vợt khi hỏi giày
- ❗ MATCHEDPRODUCTS phải chính xác 100% với category khách hàng yêu cầu

- Nếu hỏi về VỢT CẦU LÔNG: 
  * TRÌNH ĐỘ: "Mới chơi/người mới" → vợt dẻo/flexible, "Trung bình" → vợt cứng trung bình/medium, "Khá tốt/tốt/giỏi" → vợt cứng/stiff
  * ĐỘ CỨNG THÂN VỢT: Dẻo (flexible) cho người mới, Trung bình (medium) cho trung bình, Cứng (stiff) cho khá tốt
  * CHỈ GỢI Ý các sản phẩm VỢT có specifications phù hợp với yêu cầu trình độ và độ cứng
- Nếu hỏi về GIÀY CẦU LÔNG: CHỈ gợi ý các sản phẩm GIÀY phù hợp với sân và phong cách chơi
- Nếu hỏi về ÁO QUẦN: CHỈ tư vấn các sản phẩm TRANG PHỤC thoáng mát, co giãn tốt
- Nếu hỏi về PHỤ KIỆN: CHỈ gợi ý các PHỤ KIỆN như grip, dây vợt, túi đựng vợt, shuttlecock...
- Nếu hỏi về GIÁ CẢ: So sánh giá, gợi ý sản phẩm trong tầm giá
- Nếu hỏi về THƯƠNG HIỆU: Giải thích đặc điểm từng thương hiệu
- Nếu hỏi về KỸ THUẬT: Có thể tư vấn cơ bản, nhưng khuyến khích mua thiết bị phù hợp
- Nếu KHIẾU NẠI: Thể hiện sự quan tâm, hướng dẫn giải quyết
- Nếu HỎI CHUNG: Trò chuyện thân thiện, hướng về sản phẩm cầu lông
- Nếu HỎI NGOÀI LĨNH VỰC: Trả lời thông minh, hài hước và thân thiện. Có thể trả lời các câu hỏi kiến thức chung, nhưng sau đó nhẹ nhàng chuyển hướng về shop.

Hãy trả lời theo format JSON sau:
{
  "response": "Câu trả lời chi tiết, thân thiện và hữu ích",
  "matchedProducts": ["tên sản phẩm 1", "tên sản phẩm 2", ...],
  "suggestions": ["gợi ý 1", "gợi ý 2", "gợi ý 3", "gợi ý 4"],
  "intent": "product_search|pricing|policy|support|complaint|general|off_topic"
}

🚨 QUY TẮC MATCHEDPRODUCTS NGHIÊM NGẶT:
1. CHỈ được dùng CHÍNH XÁC tên sản phẩm từ "DANH SÁCH SẢN PHẨM CÓ SẴN" ở trên
2. KHÔNG được tự sáng tạo hay thay đổi tên sản phẩm 
3. COPY CHÍNH XÁC tên từ danh sách, không được sửa đổi gì

VÍ DỤ:
❌ SAI: AI thấy "Giày cầu lông Lining AYTU025-1" nhưng viết thành "Vợt cầu lông Lining AYTU025-1"
✅ ĐÚNG: Copy chính xác "Giày cầu lông Lining AYTU025-1" như trong danh sách

🎯 KHI KHÁCH HỎNG VỢT: CHỈ chọn sản phẩm có từ "VỢT" trong tên, bỏ qua giày/balo/quần áo

LƯU Ý QUAN TRỌNG:
- Luôn trả lời bằng tiếng Việt tự nhiên
- Sử dụng emoji phù hợp để tạo cảm xúc (🏸 cho cầu lông, 🎯 cho vợt, 👟 cho giày...)
- Nếu không biết thông tin cụ thể, hãy thành thật và hướng dẫn liên hệ
- Với câu hỏi ngoài lề, hãy trả lời thông minh, hài hước và thân thiện trước, sau đó mới chuyển hướng về shop
- Thể hiện sự quan tâm và sẵn sàng hỗ trợ
- Tư vấn về trình độ chơi và lựa chọn thiết bị phù hợp
- Đừng từ chối trả lời các câu hỏi kiến thức chung, hãy trả lời một cách thông minh và hài hước
`;
  }

  /**
   * Find the best matching product using more precise string matching
   */
  findBestProductMatch(products, productName) {
    if (!productName || !Array.isArray(products)) return null;
    
    const searchName = productName.toLowerCase().trim();
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔍 Searching for product: "${productName}"`);
    }
    
    // 1. Exact match
    let exactMatch = products.find(p => 
      p.name?.toLowerCase().trim() === searchName
    );
    if (exactMatch) return exactMatch;
    
    // 2. Starts with match
    let startsWithMatch = products.find(p => 
      p.name?.toLowerCase().trim().startsWith(searchName) ||
      searchName.startsWith(p.name?.toLowerCase().trim() || '')
    );
    if (startsWithMatch) return startsWithMatch;
    
    // 3. Word boundary match
    const searchWords = searchName.split(/\s+/);
    let wordBoundaryMatch = products.find(p => {
      const productWords = p.name?.toLowerCase().trim().split(/\s+/) || [];
      return searchWords.every(searchWord => 
        productWords.some(productWord => 
          productWord === searchWord || 
          productWord.includes(searchWord) && searchWord.length > 2
        )
      );
    });
    if (wordBoundaryMatch) return wordBoundaryMatch;
    
    // 4. Category-specific match
    let categoryFilteredMatch = products.find(p => {
      const productNameLower = p.name?.toLowerCase() || '';
      
      if (/(vợt|racket|cần|bat)/i.test(searchName)) {
        const isRacketProduct = /(vợt|racket|cần|bat)/i.test(productNameLower);
        return isRacketProduct && productNameLower.includes(searchName);
      }
      
      if (/(giày|shoes|shoe)/i.test(searchName)) {
        const isShoeProduct = /(giày|shoes|shoe)/i.test(productNameLower);
        return isShoeProduct && productNameLower.includes(searchName);
      }
      
      return productNameLower.includes(searchName);
    });
    
    return categoryFilteredMatch || null;
  }

  /**
   * Clean AI response text to remove mentions of products not in final list
   */
  cleanResponseText(responseText, finalProductNames, allProducts) {
    try {
      let cleanedText = responseText;
      
      // Get all product names for reference
      const allProductNames = allProducts.map(p => p.name);
      
      // Find product names mentioned in text but not in final list
      const invalidMentions = [];
      
      allProductNames.forEach(productName => {
        // Check if this product is mentioned in text but not in final list
        const isInText = cleanedText.toLowerCase().includes(productName.toLowerCase());
        const isInFinalList = finalProductNames.some(finalName => 
          finalName.toLowerCase() === productName.toLowerCase()
        );
        
        if (isInText && !isInFinalList) {
          invalidMentions.push(productName);
          
          if (process.env.NODE_ENV !== 'production') {
            console.log(`🚫 Removing invalid mention: "${productName}"`);
          }
          
          // Remove product mentions from text
          const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Remove bullet points containing this product
          const bulletRegex = new RegExp(`^[\\s]*[*\\-•].*${escapedName}.*$`, 'gmi');
          cleanedText = cleanedText.replace(bulletRegex, '');
          
          // Remove sentences containing this product  
          const sentenceRegex = new RegExp(`[^.!?]*${escapedName}[^.!?]*[.!?]?`, 'gi');
          cleanedText = cleanedText.replace(sentenceRegex, '');
        }
      });
      
      // Additional category-specific cleaning for category mismatches
      // If user wants racket but AI mentions shoes/bags/clothes, remove those mentions
      if (responseText.toLowerCase().includes('vợt') || responseText.toLowerCase().includes('racket')) {
        // Remove any mentions of non-racket categories
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Giày[^.!?]*[.!?]?/gi, '');
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Balo[^.!?]*[.!?]?/gi, '');
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Quần[^.!?]*[.!?]?/gi, '');
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Áo[^.!?]*[.!?]?/gi, '');
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Váy[^.!?]*[.!?]?/gi, '');
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Túi[^.!?]*[.!?]?/gi, '');
        cleanedText = cleanedText.replace(/[*\-•]\s*\*?\*?Vớ[^.!?]*[.!?]?/gi, '');
      }
      
      // Clean up formatting
      cleanedText = cleanedText
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .replace(/\*\s*\*\s*/g, '')
        .replace(/^\s*[-*•]\s*$/gm, '')
        .trim();
      
      // Provide fallback if text too short
      if (cleanedText.length < 50) {
        cleanedText = `Với trình độ của bạn, mình gợi ý những sản phẩm phù hợp sau: ${finalProductNames.slice(0, 3).join(', ')}. Những sản phẩm này sẽ giúp bạn chơi tốt hơn!`;
      }
      
      return cleanedText;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error cleaning response text:', error);
      }
      return responseText; // Return original if cleaning fails
    }
  }

  /**
   * Validate if product specs match user intent
   */
  validateProductSpecs(product, userMessage) {
    const skillLevel = extractSkillLevel(product);
    const keySpecs = extractKeySpecs(product);
    
    // Category intent detection
    const isRacketRequest = /vợt|racket|cần|bat/i.test(userMessage);
    const isShoeRequest = /giày|shoes|shoe/i.test(userMessage);
    
    // Product category detection
    const productName = product.name?.toLowerCase() || '';
    const isRacketProduct = /(vợt|racket|cần|bat)/i.test(productName);
    const isShoeProduct = /(giày|shoes|shoe)/i.test(productName);
    
    // Category validation - if user asks for racket, only suggest rackets
    if (isRacketRequest && !isRacketProduct) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Category mismatch: User wants racket but ${product.name} is not a racket`);
      }
      return false;
    }
    
    // Category validation - if user asks for shoes, only suggest shoes
    if (isShoeRequest && !isShoeProduct) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Category mismatch: User wants shoes but ${product.name} is not shoes`);
      }
      return false;
    }
    
    // Skill level intent detection
    const isBeginnerRequest = /người mới|beginner|khởi nghiệp|mới học|mới chơi/i.test(userMessage);
    const isIntermediateRequest = /trung bình|intermediate|vừa phải|bình thường/i.test(userMessage);
    const isAdvancedRequest = /khá tốt|cao cấp|advanced|giỏi|chuyên nghiệp|pro|tốt|khá|giỏi giang/i.test(userMessage);
    const isFlexibleRequest = /dẻo|mềm|flexible|soft/i.test(userMessage);
    const isStiffRequest = /cứng|stiff|hard/i.test(userMessage);
    
    // Validate skill level match
    if (isBeginnerRequest && skillLevel !== 'beginner') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Skill mismatch: ${product.name} is ${skillLevel}, user wants beginner`);
      }
      return false;
    }
    if (isIntermediateRequest && skillLevel !== 'intermediate') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Skill mismatch: ${product.name} is ${skillLevel}, user wants intermediate`);
      }
      return false;
    }
    if (isAdvancedRequest && skillLevel !== 'advanced') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Skill mismatch: ${product.name} is ${skillLevel}, user wants advanced`);
      }
      return false;
    }
    
    // Validate flexibility match
    if (isFlexibleRequest && keySpecs.flexibility !== 'flexible') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Flexibility mismatch: ${product.name} is ${keySpecs.flexibility}, user wants flexible`);
      }
      return false;
    }
    if (isStiffRequest && !['stiff', 'extra_stiff'].includes(keySpecs.flexibility)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Flexibility mismatch: ${product.name} is ${keySpecs.flexibility}, user wants stiff`);
      }
      return false;
    }
    
    return true; // Specs match or no specific requirements
  }

  /**
   * Parse AI response and match with actual products
   */
  async parseAIResponse(aiText, products, userProfile, userMessage) {
    try {
      // Try to parse JSON response from AI
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 🎯 DEBUG: Log AI's raw response and matchedProducts
        if (process.env.NODE_ENV !== 'production') {
          console.log('🤖 AI Raw Response Text:', parsed.response?.substring(0, 200) + '...');
          console.log('🤖 AI Raw matchedProducts:', parsed.matchedProducts);
        }

        // Find actual product objects based on AI recommendations
        const matchedProducts = [];
        
        // Debug: Log userProfile info
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🧪 [DEBUG] UserProfile in AI parsing:`, {
            hasUserProfile: !!userProfile,
            purchaseHistoryCount: userProfile?.purchaseHistory?.length || 0,
            purchaseHistoryIds: userProfile?.purchaseHistory?.map(p => p.id) || []
          });
        }
        
        if (parsed.matchedProducts && Array.isArray(parsed.matchedProducts)) {
          parsed.matchedProducts.forEach((productName) => {
                if (process.env.NODE_ENV !== 'production') {
              console.log(`🤖 AI suggested product: "${productName}"`);
            }
            
            const product = this.findBestProductMatch(products, productName);
            
            if (process.env.NODE_ENV !== 'production' && product) {
              console.log(`✅ Matched: "${product.name}" (ID: ${product.id})`);
            }
            
            if (product) {
              // Kiểm tra specs có phù hợp không
              if (!this.validateProductSpecs(product, userMessage)) {
                return;
              }

              // Anti-duplicate filter
              if (userProfile?.purchaseHistory) {
                const alreadyPurchased = userProfile.purchaseHistory.some(p => p.id === product.id);
                if (alreadyPurchased) {
                  if (process.env.NODE_ENV !== 'production') {
                    console.log(`🚫 Skipping purchased product: ${product.name}`);
                  }
                  return;
                }
              }

              // Lấy giá từ variant nếu product.price = 0 hoặc "0.00"
              let displayPrice = parseFloat(product.price) || 0;
              let displayComparePrice = parseFloat(product.compareAtPrice) || undefined;
              if (displayPrice === 0 && product.variants?.length > 0) {
                const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
                displayPrice = parseFloat(defaultVariant.price) || 0;
                displayComparePrice = parseFloat(defaultVariant.compareAtPrice) || displayComparePrice;
              }
              
              matchedProducts.push({
                id: product.id,
                name: product.name,
                price: displayPrice,
                compareAtPrice: displayComparePrice,
                thumbnail: product.thumbnail,
                inStock: product.inStock,
                rating: 4.5,
              });
            }
          });
        }

        // 🎯 ENSURE MINIMUM PRODUCTS: If not enough products after filtering, add more
        let finalProducts = matchedProducts;
        const targetProductCount = 3;
        
        if (finalProducts.length < targetProductCount) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`⚠️  Only ${finalProducts.length} products after anti-duplicate filter. Finding more...`);
          }
          
          // Get additional products from same categories as user preferences
          const additionalProducts = await this.getAdditionalProducts(
            finalProducts, 
            userProfile, 
            targetProductCount - finalProducts.length,
            userMessage // ✅ THÊM: Pass user message for intent detection
          );
          
          finalProducts = [...finalProducts, ...additionalProducts];
        }

        // Clean AI response text
        const finalProductNames = finalProducts.slice(0, targetProductCount).map(p => p.name);
        let validatedResponse = parsed.response || 'Tôi có thể giúp bạn tìm sản phẩm phù hợp!';
        validatedResponse = this.cleanResponseText(validatedResponse, finalProductNames, products);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`✅ Final products:`, finalProductNames);
          console.log(`🔧 Response text cleaned and validated`);
        }

        return {
          response: validatedResponse,
          products: finalProducts.slice(0, targetProductCount),
          suggestions: parsed.suggestions || [
            'Xem tất cả sản phẩm',
            'Sản phẩm khuyến mãi',
            'Hỗ trợ mua hàng',
            'Liên hệ tư vấn',
          ],
          intent: parsed.intent || 'general',
        };
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error.message || error);
    }

    // Fallback: simple keyword matching
    return await this.simpleKeywordMatch(userMessage, products, userProfile);
  }

  /**
   * Simple keyword matching fallback
   */
  async simpleKeywordMatch(userMessage, products, userProfile) {
    const lowerMessage = userMessage.toLowerCase().trim();
    let matchedProducts = [];
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `🔍 Searching for: "${lowerMessage}" in ${products.length} products`
      );
    }

    // Extract search terms from user message
    const searchTerms = lowerMessage
      .split(' ')
      .filter((term) => term.length > 1); // Reduced from 2 to 1 to catch single-char terms
    searchTerms.push(lowerMessage); // Add full message

    // Add Vietnamese-English keyword mapping for badminton
    const keywordMapping = {
      vợt: ['vợt', 'racket', 'racquet', 'vot'],
      'vợt cầu lông': ['vợt cầu lông', 'badminton racket', 'racquet'],
      giày: ['giày', 'shoes', 'shoe', 'giày cầu lông', 'badminton shoes'],
      áo: ['áo', 'shirt', 'jersey', 'áo cầu lông', 'badminton shirt'],
      quần: ['quần', 'shorts', 'quần cầu lông', 'badminton shorts'],
      grip: ['grip', 'cán vợt', 'overgrip'],
      dây: ['dây', 'string', 'dây vợt', 'cước'],
      'phụ kiện': ['phụ kiện', 'accessories', 'grip', 'string'],
    };

    // Expand search terms with mappings
    const expandedTerms = [...searchTerms];
    Object.keys(keywordMapping).forEach((viTerm) => {
      if (lowerMessage.includes(viTerm)) {
        expandedTerms.push(...keywordMapping[viTerm]);
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔍 Expanded search terms:`, expandedTerms);
    }

    // Search through products using their dynamic keywords
    products.forEach((product) => {
      let matchScore = 0;
      const productName = product.name?.toLowerCase() || '';
      const productDesc = product.shortDescription?.toLowerCase() || '';
      const productFullDesc = product.description?.toLowerCase() || '';

      // 1. Direct match in product name (highest priority)
      expandedTerms.forEach((term) => {
        if (productName.includes(term.toLowerCase())) {
          matchScore += 10;
          if (process.env.NODE_ENV !== 'production') {
            console.log(`✅ Name match: "${product.name}" contains "${term}"`);
          }
        }
      });

      // 2. Match in short description
      expandedTerms.forEach((term) => {
        if (productDesc.includes(term.toLowerCase())) {
          matchScore += 8;
          if (process.env.NODE_ENV !== 'production') {
            console.log(
              `✅ Description match: "${product.name}" desc contains "${term}"`
            );
          }
        }
      });

      // 3. Match in search keywords (dynamic from database)
      if (product.searchKeywords && Array.isArray(product.searchKeywords)) {
        expandedTerms.forEach((term) => {
          const keywordMatches = product.searchKeywords.filter(
            (keyword) =>
              keyword.toLowerCase().includes(term.toLowerCase()) ||
              term.toLowerCase().includes(keyword.toLowerCase())
          );
          if (keywordMatches.length > 0) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `✅ Keyword matches for "${product.name}":`,
                keywordMatches
              );
            }
            matchScore += keywordMatches.length * 5;
          }
        });
      }

      // 4. Partial matches in full product text
      const productText = `${productName} ${productDesc} ${productFullDesc}`;
      expandedTerms.forEach((term) => {
        if (productText.includes(term.toLowerCase())) {
          matchScore += 2;
        }
      });

      // Add product if it has any matches
      if (matchScore > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `✅ Product "${product.name}" matched with score: ${matchScore}`
          );
        }
        matchedProducts.push({ ...product, matchScore });
      }
    });

    // Sort by match score (highest first)
    matchedProducts.sort((a, b) => b.matchScore - a.matchScore);

    // Remove duplicates
    const uniqueProducts = matchedProducts.filter(
      (product, index, self) =>
        index === self.findIndex((p) => p.id === product.id)
    );

    // 🎯 ANTI-DUPLICATE FILTER: Remove already purchased products
    let filteredProducts = uniqueProducts;
    if (userProfile?.purchaseHistory) {
      const purchasedProductIds = userProfile.purchaseHistory.map(p => p.id);
      const originalCount = filteredProducts.length;
      filteredProducts = uniqueProducts.filter(p => !purchasedProductIds.includes(p.id));
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Filtered out ${originalCount - filteredProducts.length} already purchased products`);
        if (filteredProducts.length !== originalCount) {
          const removedProducts = uniqueProducts.filter(p => purchasedProductIds.includes(p.id));
          removedProducts.forEach(p => {
            console.log(`   🚫 Removed: ${p.name} (ID: ${p.id})`);
          });
        }
      }
    }

    // 🎯 ENSURE MINIMUM PRODUCTS: If not enough after filtering, add more
    let finalProducts = filteredProducts;
    const targetProductCount = 3;
    
    if (finalProducts.length > 0 && finalProducts.length < targetProductCount) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`⚠️  Only ${finalProducts.length} products after anti-duplicate filter in keyword search. Finding more...`);
      }
      
      // Get additional products from same categories as user preferences
      const additionalProducts = await this.getAdditionalProducts(
        finalProducts, 
        userProfile, 
        targetProductCount - finalProducts.length,
        userMessage // ✅ THÊM: Pass user message for intent detection
      );
      
      finalProducts = [...finalProducts, ...additionalProducts];
    }

    if (finalProducts.length > 0) {
      const productList = finalProducts
        .slice(0, 5)
        .map((p) => {
          // Lấy giá từ variant nếu product.price = 0 hoặc "0.00"
          let displayPrice = parseFloat(p.price) || 0;
          if (displayPrice === 0 && p.variants?.length > 0) {
            const defaultVariant = p.variants.find(v => v.isDefault) || p.variants[0];
            displayPrice = parseFloat(defaultVariant.price) || 0;
          }
          return `• ${p.name} - ${displayPrice?.toLocaleString('vi-VN')}đ`;
        })
        .join('\n');

      return {
        response: `🔍 Tôi tìm thấy ${finalProducts.length} sản phẩm phù hợp với "${userMessage}":\n\n${productList}\n\nBạn muốn xem chi tiết sản phẩm nào không?`,
        products: finalProducts.slice(0, targetProductCount).map((product) => {
          // Lấy giá từ variant nếu product.price = 0 hoặc "0.00"
          let displayPrice = parseFloat(product.price) || 0;
          let displayComparePrice = parseFloat(product.compareAtPrice) || undefined;
          if (displayPrice === 0 && product.variants?.length > 0) {
            const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
            displayPrice = parseFloat(defaultVariant.price) || 0;
            displayComparePrice = parseFloat(defaultVariant.compareAtPrice) || displayComparePrice;
          }
          
          return {
            id: product.id,
            name: product.name,
            price: displayPrice,
            compareAtPrice: displayComparePrice,
            thumbnail: product.thumbnail,
            inStock: product.inStock,
            rating: 4.5,
          };
        }),
        suggestions: [
          'Xem tất cả sản phẩm',
          'Lọc theo giá',
          'Sản phẩm khuyến mãi',
          'Thêm vào giỏ hàng',
        ],
        intent: 'product_search',
      };
    }

    return await this.getFallbackResponse(userMessage);
  }

  /**
   * Get all products from database
   */
  async getAllProducts() {
    try {
      const products = await Product.findAll({
        where: {
          status: 'active',
          inStock: true,
        },
        attributes: [
          'id',
          'name',
          'shortDescription',
          'description',
          'price',
          'compareAtPrice',
          'thumbnail',
          'inStock',
          'searchKeywords',
        ],
        include: [
          {
            model: require('../models').ProductVariant,
            as: 'variants',
            attributes: ['id', 'price', 'compareAtPrice', 'isDefault'],
            required: false,
          },
          {
            model: require('../models').ProductSpecification,
            as: 'productSpecifications',
            attributes: ['name', 'value', 'category'],
            required: false,
          }
        ],
        limit: 100, // Limit to avoid too much data
      });

      const result = products.map((p) => {
        const productJson = p.toJSON();
        
        
        return productJson;
      });

      return result;
    } catch (error) {
      console.error('Error fetching products:', error);
      return [];
    }
  }

  /**
   * Enhanced fallback response for various scenarios
   */
  async getFallbackResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();

    // Product search patterns for badminton
    if (
      lowerMessage.includes('vợt') ||
      lowerMessage.includes('racket') ||
      lowerMessage.includes('racquet')
    ) {
      return {
        response:
          '🎯 Chúng tôi có nhiều loại vợt cầu lông chất lượng! Yonex Arcsaber, Victor Thruster, Li-Ning Windstorm... Bạn đang tìm vợt cho trình độ nào?',
        suggestions: [
          'Vợt Yonex 🏸',
          'Vợt Victor ⚡',
          'Vợt Li-Ning 🔥',
          'Vợt cho người mới chơi 🌟',
        ],
        intent: 'product_search',
      };
    }

    if (lowerMessage.includes('giày') || lowerMessage.includes('shoe')) {
      return {
        response:
          '👟 Chúng tôi có nhiều loại giày cầu lông chuyên dụng! Yonex Power Cushion, Victor A362, Mizuno Wave Claw... Bạn chơi sân nào (nhựa/gỗ)?',
        suggestions: [
          'Giày Yonex 👟',
          'Giày Victor ⚡',
          'Giày Mizuno 🌊',
          'Giày cho sân gỗ 🏸',
        ],
        intent: 'product_search',
      };
    }

    if (lowerMessage.includes('áo') || lowerMessage.includes('shirt')) {
      return {
        response:
          '👕 Chúng tôi có nhiều mẫu áo cầu lông thoáng mát! Yonex Tour Elite, Victor T-shirt, Li-Ning AAYN... Bạn thích kiểu nào?',
        suggestions: ['Áo Yonex 👕', 'Áo Victor ⚡', 'Áo Li-Ning 🔥', 'Áo nữ cầu lông 💃'],
        intent: 'product_search',
      };
    }

    if (
      lowerMessage.includes('grip') ||
      lowerMessage.includes('cán vợt') ||
      lowerMessage.includes('overgrip')
    ) {
      return {
        response:
          '🤏 Chúng tôi có nhiều loại grip chất lượng! Yonex Super Grap, Victor Grip, Tourna Grip... Bạn thích loại nào?',
        suggestions: [
          'Grip Yonex 🎯',
          'Overgrip Victor ⚡',
          'Grip chống trượt 🤲',
          'Xem tất cả grip 👀',
        ],
        intent: 'product_search',
      };
    }

    if (
      lowerMessage.includes('dây vợt') ||
      lowerMessage.includes('string') ||
      lowerMessage.includes('cước')
    ) {
      return {
        response:
          '🎯 Chúng tôi có nhiều loại dây vợt chuyên dụng! Yonex BG65, Victor VS850, Li-Ning No.1... Bạn thích độ căng nào?',
        suggestions: [
          'Dây Yonex BG65 🏸',
          'Dây Victor VS850 ⚡',
          'Dây đánh tấn công 💥',
          'Dây đánh phòng thủ 🛡️',
        ],
        intent: 'product_search',
      };
    }

    // Deals/Promotion inquiries  
    if (
      lowerMessage.includes('khuyến mãi') ||
      lowerMessage.includes('giảm giá') ||
      lowerMessage.includes('sale') ||
      lowerMessage.includes('promotion') ||
      lowerMessage.includes('deal') ||
      lowerMessage.includes('ưu đãi')
    ) {
      return await this.getDealsProducts(userProfile);
    }

    // Pricing inquiries
    if (
      lowerMessage.includes('giá') ||
      lowerMessage.includes('bao nhiêu') ||
      lowerMessage.includes('price')
    ) {
      return {
        response:
          '💰 BadmintonShop có đồ cầu lông đa dạng từ 200k-10M! Vợt từ 500k-8M, giày từ 800k-3M, phụ kiện từ 50k-500k. Bạn muốn tìm trong tầm giá nào?',
        suggestions: [
          'Vợt dưới 2 triệu 🎯',
          'Giày dưới 1.5 triệu 👟',
          'Phụ kiện dưới 500k 🔧',
          'Xem khuyến mãi hôm nay 🎉',
        ],
        intent: 'pricing',
      };
    }

    // Policy inquiries
    if (
      lowerMessage.includes('đổi trả') ||
      lowerMessage.includes('bảo hành') ||
      lowerMessage.includes('chính sách')
    ) {
      return {
        response:
          '📋 Chính sách BadmintonShop:\n• Đổi trả trong 7 ngày\n• Miễn phí ship đơn >500k\n• Bảo hành theo nhà sản xuất\n• Hỗ trợ 24/7\nBạn cần biết thêm gì không?',
        suggestions: [
          'Cách đổi trả',
          'Phí vận chuyển',
          'Thời gian giao hàng',
          'Liên hệ hỗ trợ',
        ],
        intent: 'policy',
      };
    }

    // Shipping inquiries
    if (
      lowerMessage.includes('giao hàng') ||
      lowerMessage.includes('ship') ||
      lowerMessage.includes('vận chuyển')
    ) {
      return {
        response:
          '🚚 Thông tin giao hàng:\n• Nội thành: 1-3 ngày\n• Ngoại thành: 3-7 ngày\n• Miễn phí ship đơn >500k\n• COD toàn quốc\nBạn ở khu vực nào ạ?',
        suggestions: [
          'Phí ship nội thành',
          'Phí ship ngoại thành',
          'Giao hàng nhanh',
          'Thanh toán COD',
        ],
        intent: 'support',
      };
    }

    // Size inquiries
    if (
      lowerMessage.includes('size') ||
      lowerMessage.includes('kích thước') ||
      lowerMessage.includes('số')
    ) {
      return {
        response:
          '📏 Hướng dẫn chọn size đồ cầu lông:\n• Giày: 39-44 (nam), 35-40 (nữ)\n• Áo: S, M, L, XL, XXL\n• Vợt: Grip size G4, G5\n• Quần: S, M, L, XL\nBạn cần tư vấn size sản phẩm nào?',
        suggestions: [
          'Size giày cầu lông 👟',
          'Size áo cầu lông 👕',
          'Grip size vợt 🎯',
          'Bảng size chi tiết 📋',
        ],
        intent: 'support',
      };
    }

    // Complaint handling
    if (
      lowerMessage.includes('khiếu nại') ||
      lowerMessage.includes('phàn nàn') ||
      lowerMessage.includes('không hài lòng')
    ) {
      return {
        response:
          '😔 BadmintonShop rất xin lỗi vì trải nghiệm không tốt! Chúng tôi luôn lắng nghe và cải thiện. Bạn có thể chia sẻ chi tiết để chúng tôi hỗ trợ tốt nhất không?',
        suggestions: [
          'Liên hệ hotline',
          'Chat với tư vấn viên',
          'Gửi email khiếu nại',
          'Đánh giá dịch vụ',
        ],
        intent: 'complaint',
      };
    }

    // Off-topic but friendly responses
    if (
      lowerMessage.includes('thời tiết') ||
      lowerMessage.includes('weather')
    ) {
      return {
        response:
          '🌤️ Thời tiết hôm nay thế nào nhỉ? Dù nắng hay mưa thì outfit đẹp vẫn quan trọng! BadmintonShop có nhiều sản phẩm phù hợp mọi thời tiết đấy!',
        suggestions: [
          'Áo thun mát mẻ ☀️',
          'Giày chống nước 🌧️',
          'Balo đi học/làm 🎒',
          'Phụ kiện thời trang ✨',
        ],
        intent: 'off_topic',
      };
    }

    if (
      lowerMessage.includes('ăn') ||
      lowerMessage.includes('food') ||
      lowerMessage.includes('món')
    ) {
      return {
        response:
          '🍕 Haha, tôi không bán đồ ăn nhưng có thể giúp bạn chọn đồ cầu lông để tập luyện khỏe mạnh! Chơi cầu lông giúp tiêu hao calories đấy!',
        suggestions: [
          'Vợt cho người mới 🎯',
          'Giày tập luyện 👟',
          'Áo thoáng mát 👕',
          'Set đồ cầu lông hoàn hảo ✨',
        ],
        intent: 'off_topic',
      };
    }

    // Xử lý câu hỏi về chủ quyền lãnh thổ
    if (
      (lowerMessage.includes('hoàng sa') ||
        lowerMessage.includes('trường sa')) &&
      lowerMessage.includes('của')
    ) {
      return {
        response:
          '🇻🇳 Quần đảo Hoàng Sa và Trường Sa là của Việt Nam! Chủ quyền lãnh thổ là điều thiêng liêng. Nhân tiện, BadmintonShop đang có nhiều mẫu áo thun in hình bản đồ Việt Nam cực đẹp đấy! Bạn có muốn xem không? 😊',
        suggestions: [
          'Xem áo thun in hình bản đồ Việt Nam',
          'Tìm sản phẩm khác',
          'Xem khuyến mãi hôm nay',
          'Liên hệ tư vấn',
        ],
        intent: 'off_topic',
      };
    }

    // Xử lý các câu hỏi chính trị, lịch sử
    if (
      lowerMessage.includes('chính trị') ||
      lowerMessage.includes('lịch sử') ||
      lowerMessage.includes('chiến tranh') ||
      lowerMessage.includes('đảng')
    ) {
      return {
        response:
          '📚 Đây là một chủ đề thú vị! Tôi có thể trò chuyện về nhiều vấn đề, nhưng chuyên môn chính của tôi là tư vấn thời trang và sản phẩm của BadmintonShop. Bạn có muốn tìm hiểu về các sản phẩm đang hot không? 😊',
        suggestions: [
          'Xem sản phẩm mới nhất',
          'Tìm sản phẩm theo phong cách',
          'Xem khuyến mãi hôm nay',
          'Liên hệ tư vấn',
        ],
        intent: 'off_topic',
      };
    }

    // Greeting patterns
    if (
      lowerMessage.includes('chào') ||
      lowerMessage.includes('hello') ||
      lowerMessage.includes('hi')
    ) {
      return {
        response:
          'Chào bạn! 👋 Rất vui được gặp bạn tại BadmintonShop! Tôi là trợ lý AI chuyên về đồ cầu lông, sẵn sàng giúp bạn tìm những sản phẩm cầu lông tuyệt vời. Bạn đang tìm gì vậy?',
        suggestions: [
          'Vợt cầu lông hot nhất 🏸',
          'Giày cầu lông mới 👟',
          'Khuyến mãi hôm nay 🎉',
          'Tư vấn thiết bị 💫',
        ],
        intent: 'general',
      };
    }

    // Default response
    return {
      response:
        'Tôi là trợ lý AI chuyên về đồ cầu lông của BadmintonShop! 🏸 Tôi có thể giúp bạn:\n• Tìm vợt, giày, áo quần phù hợp\n• Tư vấn thiết bị theo trình độ\n• Hỗ trợ chính sách đổi trả\n• Tư vấn thương hiệu và giá cả\n\nBạn cần hỗ trợ gì nhỉ?',
      suggestions: [
        'Tìm vợt cầu lông 🎯',
        'Xem giày cầu lông 👟',
        'Khuyến mãi hôm nay 🎁',
        'Tư vấn thiết bị 💡',
      ],
      intent: 'general',
    };
  }

  /**
   * Get additional products to ensure minimum count after anti-duplicate filtering
   * @param {Array} existingProducts - Products already selected
   * @param {Object} userProfile - User profile with preferences
   * @param {number} needCount - How many more products needed
   */
  /**
   * Extract intent filter from user message  
   */
  extractIntentFilter(userMessage) {
    if (!userMessage) return {};
    
    return {
      skillLevel: /người mới|beginner|khởi nghiệp|mới học|mới chơi/i.test(userMessage) ? 'beginner' :
                  /trung bình|intermediate|vừa phải|bình thường/i.test(userMessage) ? 'intermediate' :
                  /khá tốt|cao cấp|advanced|giỏi|chuyên nghiệp|pro|tốt|khá|giỏi giang/i.test(userMessage) ? 'advanced' : null,
      flexibility: /dẻo|mềm|flexible|soft/i.test(userMessage) ? 'flexible' :
                   /cứng|stiff|hard/i.test(userMessage) ? 'stiff' : null
    };
  }

  async getDealsProducts(userProfile) {
    try {
      // Use the same controller logic as frontend API /deals
      const productController = require('../controllers/product.controller');
      
      // Create mock req/res objects to call the existing getDeals function
      const mockReq = {
        query: {
          minDiscount: 50, // Match frontend requirement  
          limit: 6,
          sort: 'discount_desc'
        }
      };
      
      let dealsData = null;
      const mockRes = {
        status: () => mockRes,
        json: (data) => {
          dealsData = data;
          return mockRes;
        }
      };

      await productController.getDeals(mockReq, mockRes, () => {});

      if (!dealsData) {
        throw new Error('No deals data returned from controller');
      }

      // Check different possible response structures
      let discountedProducts = null;
      if (dealsData.data && Array.isArray(dealsData.data.products)) {
        discountedProducts = dealsData.data.products;
      } else if (dealsData.data && Array.isArray(dealsData.data)) {
        discountedProducts = dealsData.data;
      } else if (Array.isArray(dealsData)) {
        discountedProducts = dealsData;
      } else {
        throw new Error(`Unexpected deals data structure: ${JSON.stringify(dealsData)}`);
      }

      if (discountedProducts.length === 0) {
        return {
          response: '🎉 Hiện tại chúng tôi đang cập nhật các chương trình khuyến mãi mới! Hãy theo dõi thường xuyên để không bỏ lỡ deal hot nhé!',
          products: [],
          suggestions: [
            'Xem sản phẩm mới 🆕',
            'Vợt cầu lông 🏸',
            'Giày cầu lông 👟',
            'Liên hệ tư vấn 💬',
          ],
          intent: 'promotion'
        };
      }

      // Products are already formatted by the controller
      const formattedProducts = discountedProducts.map(product => ({
        id: product.id,
        name: product.name,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        thumbnail: product.thumbnail,
        inStock: product.inStock,
        rating: product.averageRating || 4.5,
        discountPercentage: Math.round(product.discountPercentage),
      }));

      const savings = formattedProducts.reduce((total, product) => {
        return total + (product.compareAtPrice - product.price);
      }, 0);

      return {
        response: `🎉 Wow! Chúng tôi có ${discountedProducts.length} sản phẩm đang khuyến mãi HOT! Tiết kiệm tới ${savings.toLocaleString('vi-VN')}₫ cho khách hàng thông minh như bạn! 🔥`,
        products: formattedProducts,
        suggestions: [
          'Xem thêm khuyến mãi 🎁',
          'Sản phẩm giảm sâu 💥',
          'Deal chỉ hôm nay ⏰',
          'Thêm vào giỏ hàng 🛒',
        ],
        intent: 'promotion'
      };

    } catch (error) {
      console.error('Error fetching deals products:', error);
      return {
        response: '🎉 Chúng tôi có nhiều chương trình khuyến mãi hấp dẫn! Vui lòng thử lại sau hoặc liên hệ để được hỗ trợ tốt nhất.',
        products: [],
        suggestions: [
          'Thử lại 🔄',
          'Liên hệ hỗ trợ 💬',
          'Xem sản phẩm khác 👀',
          'Trang chủ 🏠',
        ],
        intent: 'promotion'
      };
    }
  }

  async getAdditionalProducts(existingProducts, userProfile, needCount, userMessage) {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🔍 Finding ${needCount} additional products to ensure minimum count...`);
        if (userMessage) {
          const intentFilter = this.extractIntentFilter(userMessage);
          console.log(`🎯 Intent filter:`, intentFilter);
        }
      }

      // Get IDs of products to exclude (already selected + already purchased)
      const excludeIds = [...existingProducts.map(p => p.id)];
      if (userProfile?.purchaseHistory) {
        excludeIds.push(...userProfile.purchaseHistory.map(p => p.id));
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚫 Excluding product IDs:`, excludeIds);
        console.log(`📝 From existing products:`, existingProducts.map(p => `${p.name} (${p.id})`));
        console.log(`📝 From purchase history:`, userProfile?.purchaseHistory?.map(p => `${p.name} (${p.id})`) || 'None');
      }

      const { Product, Category } = require('../models');
      const { Op } = require('sequelize');
      
      let additionalProducts = [];

      // Strategy 1: Get products from user's preferred categories
      if (userProfile?.categoryPreferences) {
        const preferredCategories = Object.keys(userProfile.categoryPreferences);
        
        if (preferredCategories.length > 0) {
          const categoryProducts = await Product.findAll({
            where: {
              status: 'active',
              inStock: true,
              id: { [Op.notIn]: excludeIds }
            },
            include: [
              {
                model: Category,
                as: 'categories',
                where: {
                  name: { [Op.in]: preferredCategories }
                },
                through: { attributes: [] },
                required: true
              },
              {
                model: require('../models').ProductVariant,
                as: 'variants',
                attributes: ['id', 'price', 'compareAtPrice', 'isDefault'],
                required: false,
              },
              {
                model: require('../models').ProductSpecification,
                as: 'productSpecifications',
                attributes: ['name', 'value', 'category'],
                required: false,
              }
            ],
            limit: needCount * 2, // Get more to have options
            order: [['createdAt', 'DESC']] // Prefer newer products
          });

          // Add products with price formatting and spec validation
          categoryProducts.forEach(product => {
            if (additionalProducts.length < needCount) {
              // ✅ SPEC VALIDATION: Check if product specs match user intent
              if (userMessage && !this.validateProductSpecs(product, userMessage)) {
                return; // Skip product with mismatched specs
              }

              // Format price like in original logic
              let displayPrice = parseFloat(product.price) || 0;
              let displayComparePrice = parseFloat(product.compareAtPrice) || undefined;
              if (displayPrice === 0 && product.variants?.length > 0) {
                const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
                displayPrice = parseFloat(defaultVariant.price) || 0;
                displayComparePrice = parseFloat(defaultVariant.compareAtPrice) || displayComparePrice;
                
                if (process.env.NODE_ENV !== 'production') {
                  console.log(`💰 [getAdditionalProducts] Fixed price for ${product.name}: ${displayPrice} (from variant: ${defaultVariant.isDefault ? 'default' : 'first'})`);
                }
              }

              additionalProducts.push({
                id: product.id,
                name: product.name,
                price: displayPrice,
                compareAtPrice: displayComparePrice,
                thumbnail: product.thumbnail,
                inStock: product.inStock,
                rating: 4.5,
                matchScore: 5 // Lower score than original matches
              });

              if (process.env.NODE_ENV !== 'production') {
                console.log(`   ✅ Added from preferred category: ${product.name}`);
              }
            }
          });
        }
      }

      // Strategy 2: If still need more, get popular products from general categories
      if (additionalProducts.length < needCount) {
        const remainingNeeded = needCount - additionalProducts.length;
        const currentExcludeIds = [...excludeIds, ...additionalProducts.map(p => p.id)];

        const popularProducts = await Product.findAll({
          where: {
            status: 'active',
            inStock: true,
            id: { [Op.notIn]: currentExcludeIds }
          },
          include: [
            {
              model: Category,
              as: 'categories',
              where: {
                name: { [Op.in]: ['VỢT CẦU LÔNG', 'GIÀY CẦU LÔNG', 'ÁO CẦU LÔNG'] }
              },
              through: { attributes: [] },
              required: true
            },
            {
              model: require('../models').ProductVariant,
              as: 'variants',
              attributes: ['id', 'price', 'compareAtPrice', 'isDefault'],
              required: false,
            },
            {
              model: require('../models').ProductSpecification,
              as: 'productSpecifications',
              attributes: ['name', 'value', 'category'],
              required: false,
            }
          ],
          limit: remainingNeeded,
          order: [['createdAt', 'DESC']]
        });

        popularProducts.forEach(product => {
          // ✅ SPEC VALIDATION: Check if product specs match user intent
          if (userMessage && !this.validateProductSpecs(product, userMessage)) {
            return; // Skip product with mismatched specs
          }

          let displayPrice = parseFloat(product.price) || 0;
          let displayComparePrice = parseFloat(product.compareAtPrice) || undefined;
          if (displayPrice === 0 && product.variants?.length > 0) {
            const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
            displayPrice = parseFloat(defaultVariant.price) || 0;
            displayComparePrice = parseFloat(defaultVariant.compareAtPrice) || displayComparePrice;
            
            if (process.env.NODE_ENV !== 'production') {
              console.log(`💰 [popularProducts] Fixed price for ${product.name}: ${displayPrice} (from variant: ${defaultVariant.isDefault ? 'default' : 'first'})`);
            }
          }

          additionalProducts.push({
            id: product.id,
            name: product.name,
            price: displayPrice,
            compareAtPrice: displayComparePrice,
            thumbnail: product.thumbnail,
            inStock: product.inStock,
            rating: 4.5,
            matchScore: 3 // Even lower score
          });

          if (process.env.NODE_ENV !== 'production') {
            console.log(`   ✅ Added popular product: ${product.name}`);
          }
        });
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`📊 Found ${additionalProducts.length} additional products to fill gaps`);
      }

      return additionalProducts.slice(0, needCount);

    } catch (error) {
      console.error('Error getting additional products:', error.message);
      return [];
    }
  }
}

module.exports = new GeminiChatbotService();
