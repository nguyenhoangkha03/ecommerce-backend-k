const { Product, ProductSpecification } = require('../models');
const { Op } = require('sequelize');

/**
 * Badminton Recommendation Helper Functions
 * Hỗ trợ gợi ý sản phẩm thông minh cho cầu lông
 */

// Trích xuất thương hiệu từ category cấp 2 (đúng cách)
const extractBrand = (product) => {
  // Ưu tiên lấy từ category cấp 2 (level 2)
  if (product.categories && product.categories.length > 0) {
    const level2Category = product.categories.find(cat => cat.level === 2);
    if (level2Category) {
      return level2Category.name; // Ví dụ: "Vợt Yonex", "Giày Victor"
    }
  }
  
  // Fallback: extract từ tên sản phẩm (như cũ)
  const productName = product.name || '';
  const brandPatterns = {
    'Yonex': /yonex/i,
    'Victor': /victor/i,
    'Li-Ning': /li[\-\s]?ning|lining/i,
    'Mizuno': /mizuno/i,
    'Kawasaki': /kawasaki/i,
    'Kumpoo': /kumpoo/i,
    'Apacs': /apacs/i,
    'Fleet': /fleet/i,
    'Forza': /forza/i
  };

  for (const [brand, pattern] of Object.entries(brandPatterns)) {
    if (pattern.test(productName)) {
      return brand;
    }
  }
  
  return 'Unknown';
};

// Helper function để normalize field names (bỏ khoảng trắng thừa, dấu :)
const normalizeFieldName = (fieldName) => {
  return fieldName.trim().replace(/[:\s]+$/, '').replace(/^\s+/, '');
};

// Trích xuất trình độ từ specifications
const extractSkillLevel = (product) => {
  const skillSpec = product.productSpecifications?.find(spec => {
    const normalizedName = normalizeFieldName(spec.name || '');
    const normalizedCategory = normalizeFieldName(spec.category || '');
    
    return normalizedName === 'Trình độ chơi' || 
           normalizedCategory === 'Trình Độ Chơi' ||
           normalizedName === 'Trình Độ Chơi' ||
           normalizedCategory === 'Trình độ chơi';
  });
  
  if (!skillSpec) {
    return 'intermediate'; // default
  }
  
  const value = skillSpec.value.toLowerCase();
  
  if (/mới chơi|beginner|khởi nghiệp/i.test(value)) return 'beginner';
  if (/trung bình|intermediate/i.test(value)) return 'intermediate';
  if (/khá tốt|advanced|giỏi/i.test(value)) return 'advanced';
  
  return 'intermediate';
};

// Trích xuất các thông số quan trọng
const extractKeySpecs = (product) => {
  const specs = {};
  
  product.productSpecifications?.forEach(spec => {
    const normalizedName = normalizeFieldName(spec.name || '');
    const fieldName = spec.name.toLowerCase();
    
    // Extract flexibility
    if ((normalizedName === 'Độ cứng đũa' || fieldName.includes('độ cứng') || fieldName.includes('cứng đũa')) && !specs.flexibility) {
      specs.flexibility = extractFlexibility(spec.value);
    }
    
    // Extract balance
    if ((normalizedName === 'Điểm cân bằng' || fieldName.includes('điểm cân bằng') || fieldName.includes('cân bằng')) && !specs.balance) {
      specs.balance = extractBalance(spec.value);
    }
    
    // Extract weight
    if ((normalizedName === 'Trọng lượng' || fieldName.includes('trọng lượng') || fieldName.includes('weight')) && !specs.weight) {
      specs.weight = extractWeight(spec.value);
    }
  });
  
  return specs;
};

const extractFlexibility = (value) => {
  if (/dẻo|flexible|mềm|soft/i.test(value)) return 'flexible';
  if (/trung bình|medium|moderate/i.test(value)) return 'medium';
  if (/cứng|stiff|hard/i.test(value)) return 'stiff';
  if (/siêu cứng|extra stiff|very hard/i.test(value)) return 'extra_stiff';
  return 'medium';
};

const extractBalance = (value) => {
  if (/head.*heavy|nặng.*đầu/i.test(value)) return 'head_heavy';
  if (/even.*balance|cân.*bằng/i.test(value)) return 'even_balance';
  if (/head.*light|nhẹ.*đầu/i.test(value)) return 'head_light';
  return 'even_balance';
};

const extractWeight = (value) => {
  if (/3u/i.test(value)) return '3U';
  if (/4u/i.test(value)) return '4U';
  if (/5u/i.test(value)) return '5U';
  return '4U';
};

// GỢI Ý THEO THƯƠNG HIỆU (dựa trên category cấp 2)
const getBrandBasedRecommendations = async (currentProduct) => {
  const currentBrand = extractBrand(currentProduct);
  
  // Brand compatibility matrix - giờ sử dụng tên category cấp 2
  const brandCompatibility = {
    // Vợt brands
    'Vợt Yonex': {
      same: ['Vợt Yonex'],
      compatible: ['Vợt Victor', 'Vợt Li-Ning'],
      reason: 'Cùng danh mục vợt Yonex - Thương hiệu premium'
    },
    'Vợt Victor': {
      same: ['Vợt Victor'], 
      compatible: ['Vợt Yonex', 'Vợt Li-Ning', 'Vợt Mizuno'],
      reason: 'Cùng danh mục vợt Victor - Chuyên nghiệp thi đấu'
    },
    'Vợt Li-Ning': {
      same: ['Vợt Li-Ning'],
      compatible: ['Vợt Victor', 'Vợt Yonex', 'Vợt Kawasaki'],
      reason: 'Cùng danh mục vợt Li-Ning - Thiết kế hiện đại'
    },
    // Giày brands  
    'Giày Yonex': {
      same: ['Giày Yonex'],
      compatible: ['Giày Victor', 'Giày Mizuno'],
      reason: 'Cùng danh mục giày Yonex - Công nghệ đệm tiên tiến'
    },
    'Giày Victor': {
      same: ['Giày Victor'],
      compatible: ['Giày Yonex', 'Giày Mizuno'],
      reason: 'Cùng danh mục giày Victor - Hỗ trợ chuyển động'
    },
    'Giày Mizuno': {
      same: ['Giày Mizuno'],
      compatible: ['Giày Victor', 'Giày Yonex'],
      reason: 'Cùng danh mục giày Mizuno - Độ bền cao'
    }
  };

  const compatibility = brandCompatibility[currentBrand] || {
    same: [currentBrand],
    compatible: [],
    reason: 'Sản phẩm cùng danh mục'
  };

  // Query sản phẩm cùng danh mục cấp 2 (ưu tiên 1)
  const sameBrandProducts = await Product.findAll({
    where: {
      id: { [Op.ne]: currentProduct.id },
      status: 'active',
      inStock: true,
    },
    attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
    include: [
      {
        association: 'categories',
        where: {
          name: { [Op.in]: compatibility.same },
          level: 2
        },
        through: { attributes: [] },
        required: true
      },
      {
        association: 'productSpecifications',
        attributes: ['name', 'value', 'category'],
        required: false
      },
      {
        association: 'reviews',
        attributes: ['rating'],
        required: false
      },
      {
        association: 'variants',
        attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
        required: false
      }
    ],
    limit: 4,
    order: [['createdAt', 'DESC']]
  });

  // Query sản phẩm danh mục tương thích (ưu tiên 2)
  const compatibleBrandProducts = await Product.findAll({
    where: {
      id: { [Op.ne]: currentProduct.id },
      status: 'active',
      inStock: true,
    },
    attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
    include: [
      {
        association: 'categories',
        where: {
          name: { [Op.in]: compatibility.compatible },
          level: 2
        },
        through: { attributes: [] },
        required: true
      },
      {
        association: 'productSpecifications',
        attributes: ['name', 'value', 'category'],
        required: false
      },
      {
        association: 'reviews',
        attributes: ['rating'],
        required: false
      },
      {
        association: 'variants',
        attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
        required: false
      }
    ],
    limit: 2,
    order: [['createdAt', 'DESC']]
  });

  return [
    ...sameBrandProducts.map(p => ({ 
      ...p.toJSON(), 
      brandScore: 1.0,
      reason: `${compatibility.reason}`
    })),
    ...compatibleBrandProducts.map(p => ({ 
      ...p.toJSON(), 
      brandScore: 0.7,
      reason: `Danh mục tương thích với ${currentBrand}`
    }))
  ];
};

// GỢI Ý THEO TRÌNH ĐỘ CHƠI
const getSkillBasedRecommendations = async (currentProduct) => {
  const currentSkillLevel = extractSkillLevel(currentProduct);
  
  // Skill progression matrix - theo thông số thực tế
  const skillProgression = {
    'beginner': {
      same: ['beginner', 'mới chơi', 'khởi nghiệp'],
      upgrade: ['intermediate', 'trung bình'],
      reason: 'Phù hợp cho người mới bắt đầu chơi cầu lông'
    },
    'intermediate': {
      same: ['intermediate', 'trung bình'],
      upgrade: ['advanced', 'khá tốt'],
      reason: 'Phù hợp cho người chơi trung bình muốn cải thiện kỹ thuật'
    },
    'advanced': {
      same: ['advanced', 'khá tốt', 'giỏi'],
      reason: 'Dành cho người chơi có kỹ thuật tốt'
    }
  };

  const progression = skillProgression[currentSkillLevel] || skillProgression['intermediate'];
  
  // Tạo điều kiện query cho specifications
  const skillConditions = [];
  
  // Same skill level (70% weight)
  if (progression.same) {
    skillConditions.push({
      weight: 0.7,
      where: {
        [Op.or]: [
          { name: 'Trình độ chơi' },
          { name: 'Trình Độ Chơi' },
          { name: { [Op.iLike]: '%Trình Độ Chơi%' } },
          { name: { [Op.iLike]: '%Trình độ chơi%' } }
        ],
        value: { [Op.iRegexp]: progression.same.join('|') }
      },
      reason: `Cùng trình độ ${currentSkillLevel}`
    });
  }
  
  // Upgrade path (30% weight) 
  if (progression.upgrade) {
    skillConditions.push({
      weight: 0.3,
      where: {
        [Op.or]: [
          { name: 'Trình độ chơi' },
          { name: 'Trình Độ Chơi' },
          { name: { [Op.iLike]: '%Trình Độ Chơi%' } },
          { name: { [Op.iLike]: '%Trình độ chơi%' } }
        ],
        value: { [Op.iRegexp]: progression.upgrade.join('|') }
      },
      reason: `Nâng cấp từ trình độ ${currentSkillLevel}`
    });
  }

  let skillProducts = [];
  
  for (const condition of skillConditions) {
    const products = await Product.findAll({
      where: {
        id: { [Op.ne]: currentProduct.id },
        status: 'active',
        inStock: true,
      },
      attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
      include: [
        {
          association: 'productSpecifications',
          where: condition.where,
          required: true,
          attributes: ['name', 'value', 'category']
        },
        {
          association: 'reviews',
          attributes: ['rating'],
          required: false
        },
        {
          association: 'variants',
          attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
          required: false
        }
      ],
      limit: 3,
      order: [['createdAt', 'DESC']]
    });
    
    skillProducts.push(...products.map(p => ({ 
      ...p.toJSON(), 
      skillScore: condition.weight,
      reason: condition.reason
    })));
  }

  return skillProducts;
};

// GỢI Ý THEO THÔNG SỐ KỸ THUẬT
const getSpecsBasedRecommendations = async (currentProduct) => {
  const currentSpecs = extractKeySpecs(currentProduct);
  
  // Nếu không có specs, return empty
  if (Object.keys(currentSpecs).length === 0) {
    return [];
  }

  // Build conditions dựa trên từng thông số
  const specConditions = [];
  
  // Flexibility matching - 4 cấp độ theo thực tế
  if (currentSpecs.flexibility) {
    const flexibilityCompatibility = {
      'flexible': {
        exact: ['dẻo', 'flexible', 'mềm', 'soft'],
        compatible: ['trung bình', 'medium', 'moderate'] // Dẻo tương thích với trung bình
      },
      'medium': {
        exact: ['trung bình', 'medium', 'moderate'],
        compatible: ['dẻo', 'flexible', 'cứng', 'stiff'] // Trung bình linh hoạt, tương thích 2 chiều
      },
      'stiff': {
        exact: ['cứng', 'stiff', 'hard'],
        compatible: ['trung bình', 'medium', 'siêu cứng', 'extra stiff'] // Cứng tương thích với trung bình và siêu cứng
      },
      'extra_stiff': {
        exact: ['siêu cứng', 'extra stiff', 'very hard'],
        compatible: ['cứng', 'stiff'] // Siêu cứng chỉ tương thích với cứng
      }
    };
    
    const compatibility = flexibilityCompatibility[currentSpecs.flexibility];
    if (compatibility) {
      // Exact match (weight 0.5)
      if (compatibility.exact.length > 0) {
        specConditions.push({
          nameCondition: {
            [Op.or]: [
              { name: 'Độ cứng đũa' },
              { name: 'Độ Cứng Đũa' },
              { name: { [Op.iLike]: '%Độ cứng đũa%' } },
              { name: { [Op.iLike]: '%Độ Cứng Đũa%' } }
            ]
          },
          value: { [Op.iRegexp]: compatibility.exact.join('|') },
          weight: 0.5,
          reason: `Cùng độ cứng ${currentSpecs.flexibility}`
        });
      }
      
      // Compatible match (weight 0.2) 
      if (compatibility.compatible.length > 0) {
        specConditions.push({
          nameCondition: {
            [Op.or]: [
              { name: 'Độ cứng đũa' },
              { name: 'Độ Cứng Đũa' },
              { name: { [Op.iLike]: '%Độ cứng đũa%' } },
              { name: { [Op.iLike]: '%Độ Cứng Đũa%' } }
            ]
          },
          value: { [Op.iRegexp]: compatibility.compatible.join('|') },
          weight: 0.2,
          reason: `Độ cứng tương thích với ${currentSpecs.flexibility}`
        });
      }
    }
  }
  
  // Balance matching - ưu tiên exact match
  if (currentSpecs.balance) {
    const balanceCompatibility = {
      'head_heavy': {
        exact: ['head heavy', 'nặng đầu', 'heavy'],
        compatible: ['even balance', 'cân bằng', 'even'] // Nặng đầu có thể thích ứng với cân bằng
      },
      'even_balance': {
        exact: ['even balance', 'cân bằng', 'even'],
        compatible: [] // Cân bằng linh hoạt nhưng ưu tiên exact match
      },
      'head_light': {
        exact: ['head light', 'nhẹ đầu', 'light'],
        compatible: ['even balance', 'cân bằng', 'even'] // Nhẹ đầu có thể thích ứng với cân bằng
      }
    };
    
    const compatibility = balanceCompatibility[currentSpecs.balance];
    if (compatibility) {
      // Exact match (weight 0.4)
      if (compatibility.exact.length > 0) {
        specConditions.push({
          nameCondition: {
            [Op.or]: [
              { name: 'Điểm cân bằng' },
              { name: 'Điểm Cân Bằng' },
              { name: { [Op.iLike]: '%Điểm cân bằng%' } },
              { name: { [Op.iLike]: '%Điểm Cân Bằng%' } }
            ]
          },
          value: { [Op.iRegexp]: compatibility.exact.join('|') },
          weight: 0.4,
          reason: `Cùng điểm cân bằng ${currentSpecs.balance}`
        });
      }
      
      // Compatible match (weight 0.15)
      if (compatibility.compatible.length > 0) {
        specConditions.push({
          nameCondition: {
            [Op.or]: [
              { name: 'Điểm cân bằng' },
              { name: 'Điểm Cân Bằng' },
              { name: { [Op.iLike]: '%Điểm cân bằng%' } },
              { name: { [Op.iLike]: '%Điểm Cân Bằng%' } }
            ]
          },
          value: { [Op.iRegexp]: compatibility.compatible.join('|') },
          weight: 0.15,
          reason: `Điểm cân bằng tương thích với ${currentSpecs.balance}`
        });
      }
    }
  }
  
  // Weight matching
  if (currentSpecs.weight) {
    specConditions.push({
      nameCondition: {
        [Op.or]: [
          { name: 'Trọng lượng' },
          { name: 'Trọng Lượng' },
          { name: { [Op.iLike]: '%Trọng lượng%' } },
          { name: { [Op.iLike]: '%Trọng Lượng%' } }
        ]
      },
      value: { [Op.iLike]: `%${currentSpecs.weight}%` },
      weight: 0.3,
      reason: `Cùng trọng lượng ${currentSpecs.weight}`
    });
  }

  let specsProducts = [];
  
  for (const condition of specConditions) {
    const products = await Product.findAll({
      where: {
        id: { [Op.ne]: currentProduct.id },
        status: 'active',
        inStock: true,
      },
      attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
      include: [
        {
          association: 'productSpecifications',
          where: {
            [Op.and]: [
              condition.nameCondition,
              { value: condition.value }
            ]
          },
          required: true,
          attributes: ['name', 'value', 'category']
        },
        {
          association: 'reviews',
          attributes: ['rating'],
          required: false
        },
        {
          association: 'variants',
          attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
          required: false
        }
      ],
      limit: 2,
      order: [['createdAt', 'DESC']]
    });
    
    specsProducts.push(...products.map(p => ({ 
      ...p.toJSON(), 
      specScore: condition.weight,
      matchedSpec: 'specifications',
      reason: condition.reason
    })));
  }

  return specsProducts;
};

// Xử lý và tính điểm cho recommendations
const processRecommendations = (recommendations, currentProductId, limit) => {
  // Remove duplicates
  const uniqueProducts = [];
  const seenIds = new Set([currentProductId]);
  
  for (const product of recommendations) {
    if (!seenIds.has(product.id)) {
      seenIds.add(product.id);
      uniqueProducts.push(product);
    }
  }
  
  // Calculate final scores
  const scoredProducts = uniqueProducts.map(product => {
    let finalScore = 0;
    
    // Brand score (40%)
    if (product.brandScore) {
      finalScore += product.brandScore * 0.4;
    }
    
    // Skill score (35%)  
    if (product.skillScore) {
      finalScore += product.skillScore * 0.35;
    }
    
    // Spec score (25%)
    if (product.specScore) {
      finalScore += product.specScore * 0.25;
    }
    
    // Calculate display price from variants
    const pricingInfo = calculateDisplayPrice(product);
    
    return {
      ...product,
      finalScore,
      // Override price with variant price
      price: pricingInfo.displayPrice,
      compareAtPrice: pricingInfo.compareAtPrice,
      discountPercentage: pricingInfo.discountPercentage,
      // Add ratings calculation
      ratings: calculateProductRatings(product)
    };
  });
  
  // Sort by final score
  scoredProducts.sort((a, b) => b.finalScore - a.finalScore);
  
  return scoredProducts.slice(0, parseInt(limit));
};

// Calculate display price from variants or product price
const calculateDisplayPrice = (product) => {
  let displayPrice = parseFloat(product.price) || 0;
  let compareAtPrice = parseFloat(product.compareAtPrice) || null;
  let discountPercentage = 0;

  // Nếu product có variants, lấy giá từ variant
  if (product.variants && product.variants.length > 0) {
    // Tìm default variant trước
    let selectedVariant = product.variants.find(v => v.isDefault) || product.variants[0];
    
    // Ưu tiên variant có stock > 0 nếu có
    const variantWithStock = product.variants.find(v => v.stockQuantity > 0);
    if (variantWithStock) {
      selectedVariant = variantWithStock;
    }
    
    // Lấy giá từ variant đã chọn
    displayPrice = parseFloat(selectedVariant.price) || displayPrice;
    compareAtPrice = parseFloat(selectedVariant.compareAtPrice || product.compareAtPrice || 0) || null;
  }

  // Tính discount percentage
  if (compareAtPrice && compareAtPrice > displayPrice) {
    discountPercentage = ((compareAtPrice - displayPrice) / compareAtPrice) * 100;
  }

  return {
    displayPrice,
    compareAtPrice,
    discountPercentage: Math.round(discountPercentage * 10) / 10
  };
};

// Calculate ratings from reviews
const calculateProductRatings = (product) => {
  const ratings = {
    average: 0,
    count: 0
  };
  
  if (product.reviews && product.reviews.length > 0) {
    const totalRating = product.reviews.reduce((sum, review) => sum + review.rating, 0);
    ratings.average = Math.round((totalRating / product.reviews.length) * 10) / 10;
    ratings.count = product.reviews.length;
  }
  
  return ratings;
};

// NEW: Helper functions cho play style comparison
const extractPlayStyle = (product) => {
  const playStyleSpec = product.productSpecifications?.find(spec => {
    const normalizedName = normalizeFieldName(spec.name || '');
    const fieldName = spec.name.toLowerCase();
    
    return normalizedName === 'Phong cách chơi' || 
           fieldName.includes('phong cách') ||
           fieldName.includes('play style');
  });
  
  if (!playStyleSpec) return 'unknown';
  
  const value = playStyleSpec.value.toLowerCase();
  
  if (/tấn công|attack|offensive/i.test(value)) return 'attack';
  if (/phòng thủ|defense|defensive/i.test(value)) return 'defense';
  if (/all.*round|toàn diện|balanced/i.test(value)) return 'allround';
  if (/control|kiểm soát/i.test(value)) return 'control';
  
  return 'unknown';
};

// NEW: Compare functions for specs similarity
const compareSkillLevel = (currentProduct, targetProduct) => {
  const currentSkill = extractSkillLevel(currentProduct);
  const targetSkill = extractSkillLevel(targetProduct);
  return currentSkill === targetSkill;
};

const compareFlexibility = (currentProduct, targetProduct) => {
  const currentSpecs = extractKeySpecs(currentProduct);
  const targetSpecs = extractKeySpecs(targetProduct);
  return currentSpecs.flexibility && targetSpecs.flexibility && 
         currentSpecs.flexibility === targetSpecs.flexibility;
};

const comparePlayStyle = (currentProduct, targetProduct) => {
  const currentStyle = extractPlayStyle(currentProduct);
  const targetStyle = extractPlayStyle(targetProduct);
  return currentStyle !== 'unknown' && targetStyle !== 'unknown' && 
         currentStyle === targetStyle;
};

// tính điểm 
const calculateSpecsSimilarity = (currentProduct, targetProduct) => {
  let score = 0;
  
  // Trình độ chơi (40% weight) - HIGHEST PRIORITY
  if (compareSkillLevel(currentProduct, targetProduct)) {
    score += 0.4;
  }
  
  // Độ cứng đũa (35% weight) - MEDIUM PRIORITY  
  if (compareFlexibility(currentProduct, targetProduct)) {
    score += 0.35;
  }
  
  // Phong cách chơi (25% weight) - LOWEST PRIORITY
  if (comparePlayStyle(currentProduct, targetProduct)) {
    score += 0.25;
  }
  
  return score;
};

// NEW: List 1 - Related Products (same brand + specs similarity + price)
const getRelatedProductsV2 = async (currentProduct, limit = 6) => {
  const currentBrand = extractBrand(currentProduct);
  
  // Lọc danh mục 
  const sameBrandProducts = await Product.findAll({
    where: {
      id: { [Op.ne]: currentProduct.id },
      status: 'active',
      inStock: true,
    },
    attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
    include: [
      {
        association: 'categories',
        where: {
          name: currentBrand,
          level: 2
        },
        through: { attributes: [] },
        required: true
      },
      {
        association: 'productSpecifications',
        attributes: ['name', 'value', 'category'],
        required: false
      },
      {
        association: 'reviews',
        attributes: ['rating'],
        required: false
      },
      {
        association: 'variants',
        attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
        required: false
      }
    ],
    limit: limit * 2, // Get more to filter later
    order: [['createdAt', 'DESC']]
  });

  // Calculate specs similarity and price difference
  const currentPrice = calculateDisplayPrice(currentProduct).displayPrice;
  
  const specsScored = sameBrandProducts.map(product => {
    const productJson = product.toJSON();
    const productPrice = calculateDisplayPrice(productJson).displayPrice;
    const pricingInfo = calculateDisplayPrice(productJson);
    
    return {
      ...productJson,
      specsScore: calculateSpecsSimilarity(currentProduct, productJson),
      priceDiff: Math.abs(currentPrice - productPrice),
      price: pricingInfo.displayPrice,
      compareAtPrice: pricingInfo.compareAtPrice,
      discountPercentage: pricingInfo.discountPercentage,
      ratings: calculateProductRatings(productJson),
      source: 'related',
      reason: `Cùng thương hiệu ${currentBrand}, thông số tương tự`
    };
  });

  // Sort by specs score first, then by price similarity
  specsScored.sort((a, b) => {
    // If specs scores are very close (within 0.01), sort by price difference
    if (Math.abs(a.specsScore - b.specsScore) < 0.01) {
      return a.priceDiff - b.priceDiff; // Closer price wins
    }
    return b.specsScore - a.specsScore; // Higher specs score wins
  });

  return specsScored.slice(0, limit);
};

// NEW: List 2 - You Might Like (best sellers theo category level 1 + price range)
const getYouMightLike = async (currentProduct, limit = 8) => {
  const currentPrice = calculateDisplayPrice(currentProduct).displayPrice;
  const priceRange = {
    min: currentPrice * 0.7,  // -30% (chuẩn)
    max: currentPrice * 1.3   // +30% (chuẩn)
  };

  // Import models để query sales data
  const { OrderItem, Order } = require('../models');

  // Lấy category level 1 của current product
  const level1Categories = currentProduct.categories?.filter(cat => cat.level === 1) || [];
  
  if (level1Categories.length === 0) {
    return [];
  }

  const level1CategoryIds = level1Categories.map(cat => cat.id);
  

  // Query products trong cùng category level 1
  const products = await Product.findAll({
    where: {
      id: { [Op.ne]: currentProduct.id },
      status: 'active',
      inStock: true,
    },
    attributes: [
      'id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 
      'featured', 'inStock', 'stockQuantity', 'createdAt'
    ],
    include: [
      {
        association: 'reviews',
        attributes: ['rating'],
        required: false
      },
      {
        association: 'variants',
        attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
        required: false
      },
      {
        association: 'categories',
        where: {
          id: { [Op.in]: level1CategoryIds },
          level: 1
        },
        through: { attributes: [] },
        required: true // REQUIRED: chỉ lấy products trong cùng category level 1
      }
    ],
    order: [
      ['featured', 'DESC'],    // Featured first (fallback)
      ['createdAt', 'DESC']    // Then newness (fallback)
    ],
    limit: limit * 3 // Get more to filter and calculate sales
  });


  // tính số lượng bán thực tế
  const productIds = products.map(p => p.id);
  const salesData = await OrderItem.findAll({
    where: {
      productId: { [Op.in]: productIds }
    },
    attributes: ['productId', 'quantity'],
    include: [{
      model: Order,
      attributes: ['status'],
      where: {
        status: ['delivered'] // Chỉ đếm orders đã giao thành công
      },
      required: true
    }]
  });

  // Calculate sales per product
  const salesByProduct = {};
  salesData.forEach(item => {
    const productId = item.productId;
    salesByProduct[productId] = (salesByProduct[productId] || 0) + (item.quantity || 0);
  });


  // Calculate sales quantity và filter
  const productsWithSales = products
    .map(product => {
      const productJson = product.toJSON();
      const pricingInfo = calculateDisplayPrice(productJson);
      
      // Get total sales from salesByProduct map
      const totalSales = salesByProduct[product.id] || 0;
      
      return {
        ...productJson,
        price: pricingInfo.displayPrice,
        compareAtPrice: pricingInfo.compareAtPrice,
        discountPercentage: pricingInfo.discountPercentage,
        ratings: calculateProductRatings(productJson),
        totalSales // Add sales data
      };
    })
    .filter(product => {
      const productPrice = product.price;
      const inRange = productPrice >= priceRange.min && productPrice <= priceRange.max;
      const hasSales = product.totalSales > 0;
      
      // Debug logging
      
      // List 2 logic: Chỉ hiển thị sản phẩm có sales > 0 (best sellers)
      return hasSales;
    })
    // Sắp xếp theo cao nhất trước, nếu bằng nhau thì theo giá gần nhất
    .sort((a, b) => {
      if (a.totalSales !== b.totalSales) {
        return b.totalSales - a.totalSales; // Sales cao nhất trước
      }
      // Nếu sales bằng nhau, ưu tiên sản phẩm có giá gần với currentPrice nhất
      const aPriceDiff = Math.abs(a.price - currentPrice);
      const bPriceDiff = Math.abs(b.price - currentPrice);
      if (aPriceDiff !== bPriceDiff) {
        return aPriceDiff - bPriceDiff; // Giá gần nhất trước
      }
      // Fallback cuối cùng: featured + createdAt
      if (a.featured !== b.featured) {
        return b.featured - a.featured;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .map(product => {
      const categoryName = level1Categories[0]?.name || 'danh mục';
      
      return {
        ...product,
        source: 'youmightlike',
        reason: product.totalSales > 0 
          ? `Bán chạy trong ${categoryName} - Đã bán ${product.totalSales} lần`
          : `Sản phẩm nổi bật trong ${categoryName} cùng phân khúc giá`,
        priceRange: {
          min: priceRange.min,
          max: priceRange.max,
          isInRange: true
        },
        categoryLevel1: categoryName
      };
    })
    .slice(0, limit);

  return productsWithSales;
};

module.exports = {
  extractBrand,
  extractSkillLevel,
  extractKeySpecs,
  extractPlayStyle,
  calculateSpecsSimilarity,
  compareSkillLevel,
  compareFlexibility,
  comparePlayStyle,
  getBrandBasedRecommendations,
  getSkillBasedRecommendations,
  getSpecsBasedRecommendations,
  processRecommendations,
  // NEW: V2 functions for 2-list system
  getRelatedProductsV2,
  getYouMightLike
};