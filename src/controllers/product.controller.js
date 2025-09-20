const {
  Product,
  Category,
  ProductAttribute,
  ProductVariant,
  ProductSpecification,
  Review,
  sequelize,
} = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const { Op } = require('sequelize');

// Helper function to calculate actual price and compare price from variants
const calculateActualPricing = (product) => {
  let actualPrice = 0;
  let actualCompareAtPrice = 0;
  
  if (product.variants && product.variants.length > 0) {
    // Find default variant or use first variant
    const defaultVariant = product.variants.find((v) => v.isDefault) || product.variants[0];
    actualPrice = defaultVariant.price || 0;
    actualCompareAtPrice = defaultVariant.compareAtPrice || actualPrice;
  } else {
    // Fallback to product level price
    actualPrice = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
    actualCompareAtPrice = typeof product.compareAtPrice === 'string' 
      ? parseFloat(product.compareAtPrice) 
      : (product.compareAtPrice || actualPrice);
  }
  
  const discountPercentage = actualCompareAtPrice > 0 && actualPrice > 0
    ? ((actualCompareAtPrice - actualPrice) / actualCompareAtPrice) * 100
    : 0;
  
  return {
    actualPrice,
    actualCompareAtPrice,
    discountPercentage
  };
};

// Get all products with pagination
const getAllProducts = async (req, res, next) => {
  try {
    console.log('🔍 getAllProducts called with query:', req.query);
    
    const {
      page = 1,
      limit = 10,
      sort = 'createdAt',
      order = 'DESC',
      category,
      search,
      minPrice,
      maxPrice,
      inStock,
      featured,
      status,
    } = req.query;

    // Build filter conditions
    const whereConditions = {};
    const includeConditions = [];

    // Search filter - prioritize product name, then short_description 
    if (search) {
      console.log('🔍 Adding search filter for:', search);
      whereConditions[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { short_description: { [Op.iLike]: `%${search}%` } },
        // Only search in description if it's a longer, more specific search
        ...(search.length > 3 ? [{ description: { [Op.iLike]: `%${search}%` } }] : [])
      ];
      console.log('🔍 Where conditions after search:', JSON.stringify(whereConditions, null, 2));
    }

    // Price filter - chỉ filter theo variant price
    if (minPrice || maxPrice) {
      const min = minPrice ? parseFloat(minPrice) : 0;
      const max = maxPrice ? parseFloat(maxPrice) : Number.MAX_SAFE_INTEGER;
      
      // Filter theo variant price bằng subquery
      whereConditions.id = {
        [Op.in]: sequelize.literal(`(
          SELECT DISTINCT product_id 
          FROM product_variants 
          WHERE price ${minPrice && maxPrice 
            ? `BETWEEN ${min} AND ${max}`
            : minPrice 
              ? `>= ${min}`
              : `<= ${max}`
          }
        )`)
      };
    }

    // Stock filter
    if (inStock !== undefined) {
      whereConditions.inStock = inStock === 'true';
    }

    // Featured filter
    if (featured !== undefined) {
      whereConditions.featured = featured === 'true';
    }

    // Status filter - mặc định chỉ lấy sản phẩm active
    if (status !== undefined) {
      whereConditions.status = status;
    } else {
      whereConditions.status = 'active';
    }

    // Category filter
    if (category) {
      // Kiểm tra xem category có phải là UUID hợp lệ không
      const isValidUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          category
        );

      if (isValidUUID) {
        // Nếu là UUID, tìm theo ID
        includeConditions.push({
          association: 'categories',
          where: { id: category },
          through: { attributes: [] },
        });
      } else {
        // Nếu không phải UUID, tìm theo slug
        includeConditions.push({
          association: 'categories',
          where: { slug: category },
          through: { attributes: [] },
        });
      }
    } else {
      includeConditions.push({
        association: 'categories',
        through: { attributes: [] },
      });
    }

    // Include attributes for product details (not for filtering)
    includeConditions.push({
      association: 'attributes',
      required: false,
    });

    // Include variants for price range calculation
    includeConditions.push({
      association: 'variants',
      required: false,
    });

    // Include reviews for ratings
    includeConditions.push({
      association: 'reviews',
      attributes: ['rating'],
    });

    // Prepare order clause
    let orderClause;
    if (sort === 'price') {
      // For price sorting, use default sort first, then re-sort by variant price later
      orderClause = [['createdAt', 'DESC']];
    } else {
      // Map other sorting options
      const sortMapping = {
        'newest': ['createdAt', 'DESC'],
        'popular': ['featured', 'DESC'],
        'rating': ['featured', 'DESC'], // Placeholder for rating sort
      };
      
      const [sortField, sortOrder] = sortMapping[sort] || [sort, order];
      orderClause = [[sortField, sortOrder]];
    }

    // Get products
    const { count, rows: productsRaw } = await Product.findAndCountAll({
      where: whereConditions,
      include: includeConditions,
      distinct: true,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: orderClause,
    });

    // Process products to add ratings
    const products = productsRaw.map((product) => {
      const productJson = product.toJSON();

      // Calculate average rating
      const ratings = {
        average: 0,
        count: 0,
      };

      if (productJson.reviews && productJson.reviews.length > 0) {
        const totalRating = productJson.reviews.reduce(
          (sum, review) => sum + review.rating,
          0
        );
        ratings.average = parseFloat(
          (totalRating / productJson.reviews.length).toFixed(1)
        );
        ratings.count = productJson.reviews.length;
      }

      // Calculate actual pricing using helper function
      const pricing = calculateActualPricing(productJson);

      // Use variant price if available, otherwise use product price
      let displayPrice = parseFloat(productJson.price) || 0;
      let compareAtPrice = parseFloat(productJson.compareAtPrice) || null;

      if (productJson.variants && productJson.variants.length > 0) {
        // Sort variants by price (ascending) to get the lowest price first
        const sortedVariants = productJson.variants.sort(
          (a, b) => parseFloat(a.price) - parseFloat(b.price)
        );
        displayPrice = parseFloat(sortedVariants[0].price) || displayPrice;
      }

      // Add ratings and remove reviews from response
      delete productJson.reviews;

      return {
        ...productJson,
        price: displayPrice,
        compareAtPrice,
        // Add actual pricing for consistent discount calculation
        actualPrice: pricing.actualPrice,
        actualCompareAtPrice: pricing.actualCompareAtPrice,
        discountPercentage: pricing.discountPercentage,
        ratings,
      };
    });

    // Re-sort by actual display price after processing
    if (sort === 'price') {
      if (order === 'ASC') {
        products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
      } else {
        products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        products,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get product by ID or slug
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if id is a UUID (contains hyphens and is 36 chars) or a slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    if (!isUUID) {
      // If it's a slug, call getProductBySlug logic
      req.params.slug = id;
      return await getProductBySlug(req, res, next);
    }
    
    // Find by UUID
    const product = await Product.findByPk(id, {
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'attributes',
        },
        {
          association: 'variants',
        },
        {
          association: 'productSpecifications',
        },
        {
          association: 'reviews',
          include: [
            {
              association: 'user',
              attributes: ['id', 'firstName', 'lastName', 'avatar'],
            },
          ],
        },
        {
          association: 'warrantyPackages',
          through: {
            attributes: ['isDefault'],
            as: 'productWarranty',
          },
          where: { isActive: true },
          required: false,
        },
      ],
    });

    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // Process product to add ratings calculation
    const productJson = product.toJSON();

    // Calculate average rating
    const ratings = {
      average: 0,
      count: 0,
    };

    if (productJson.reviews && productJson.reviews.length > 0) {
      const totalRating = productJson.reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      ratings.average = parseFloat(
        (totalRating / productJson.reviews.length).toFixed(1)
      );
      ratings.count = productJson.reviews.length;
    }

    // Add ratings to product data
    const productWithRatings = {
      ...productJson,
      ratings,
    };

    res.status(200).json({
      status: 'success',
      data: productWithRatings,
    });
  } catch (error) {
    next(error);
  }
};

// Get product by slug
const getProductBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { skuId } = req.query;

    const product = await Product.findOne({
      where: { slug },
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'attributes',
        },
        {
          association: 'variants',
          required: false,
        },
        {
          association: 'productSpecifications',
          required: false,
        },
        {
          association: 'reviews',
          include: [
            {
              association: 'user',
              attributes: ['id', 'firstName', 'lastName', 'avatar'],
            },
          ],
        },
        {
          association: 'warrantyPackages',
          through: {
            attributes: ['isDefault'],
            as: 'productWarranty',
          },
          where: { isActive: true },
          required: false,
        },
      ],
    });

    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // Process product to add ratings calculation
    const productJson = product.toJSON();

    // Calculate average rating
    const ratings = {
      average: 0,
      count: 0,
    };

    if (productJson.reviews && productJson.reviews.length > 0) {
      const totalRating = productJson.reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      ratings.average = parseFloat(
        (totalRating / productJson.reviews.length).toFixed(1)
      );
      ratings.count = productJson.reviews.length;
    }

    // Handle variant-based product
    let responseData = {
      ...productJson,
      ratings,
    };

    if (
      productJson.isVariantProduct &&
      productJson.variants &&
      productJson.variants.length > 0
    ) {
      // Find selected variant
      let selectedVariant = null;

      if (skuId) {
        selectedVariant = productJson.variants.find((v) => v.id === skuId);
      }

      // If no variant found by skuId, use default or first variant
      if (!selectedVariant) {
        selectedVariant =
          productJson.variants.find((v) => v.isDefault) ||
          productJson.variants[0];
      }

      if (selectedVariant) {
        // Override product data with variant data
        responseData = {
          ...responseData,
          // Current variant info
          currentVariant: {
            id: selectedVariant.id,
            name: selectedVariant.name,
            fullName: `${productJson.baseName || productJson.name} - ${selectedVariant.name}`,
            price: selectedVariant.price,
            compareAtPrice: selectedVariant.compareAtPrice,
            sku: selectedVariant.sku,
            stockQuantity: selectedVariant.stockQuantity,
            specifications: {
              ...productJson.specifications,
              ...selectedVariant.specifications,
            },
            images:
              selectedVariant.images && selectedVariant.images.length > 0
                ? selectedVariant.images
                : productJson.images,
          },
          // All available variants
          availableVariants: productJson.variants.map((v) => ({
            id: v.id,
            name: v.name,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            stockQuantity: v.stockQuantity,
            isDefault: v.isDefault,
            sku: v.sku,
          })),
          // Override main product fields with selected variant
          name: `${productJson.baseName || productJson.name} - ${selectedVariant.name}`,
          price: selectedVariant.price,
          compareAtPrice: selectedVariant.compareAtPrice,
          stockQuantity: selectedVariant.stockQuantity,
          sku: selectedVariant.sku,
          specifications: {
            ...productJson.specifications,
            ...selectedVariant.specifications,
          },
          images:
            selectedVariant.images && selectedVariant.images.length > 0
              ? selectedVariant.images
              : productJson.images,
        };
      }
    }

    res.status(200).json({
      status: 'success',
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
};

// Create product
const createProduct = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      baseName,
      description,
      shortDescription,
      price,
      compareAtPrice,
      images,
      thumbnail,
      categoryIds,
      inStock,
      stockQuantity,
      featured,
      searchKeywords,
      seoTitle,
      seoDescription,
      seoKeywords,
      specifications,
      parentAttributes,
      attributes,
      variants,
      warrantyPackageIds,
    } = req.body;

    // Determine if this is a variant product
    const isVariantProduct = variants && variants.length > 0;

    // Create product
    const product = await Product.create(
      {
        name,
        baseName: baseName || name,
        description,
        shortDescription,
        price: isVariantProduct ? 0 : price, // Set to 0 if using variants
        compareAtPrice: isVariantProduct ? null : compareAtPrice,
        images: images || [],
        thumbnail,
        inStock: isVariantProduct ? true : inStock, // Always true for variant products
        stockQuantity: isVariantProduct ? 0 : stockQuantity, // Set to 0 if using variants
        featured,
        searchKeywords: searchKeywords || [],
        seoTitle,
        seoDescription,
        seoKeywords: seoKeywords || [],
        isVariantProduct,
        specifications: specifications || {},
      },
      { transaction }
    );

    // Add categories
    if (categoryIds && categoryIds.length > 0) {
      const categories = await Category.findAll({
        where: { id: { [Op.in]: categoryIds } },
      });

      if (categories.length !== categoryIds.length) {
        throw new AppError('Một hoặc nhiều danh mục không tồn tại', 400);
      }

      await product.setCategories(categories, { transaction });
    }

    // Add specifications
    if (specifications && specifications.length > 0) {
      const productSpecifications = specifications.map((spec, index) => ({
        productId: product.id,
        name: spec.name,
        value: spec.value,
        category: spec.category || 'General',
        sortOrder: index,
      }));

      await ProductSpecification.bulkCreate(productSpecifications, {
        transaction,
      });
    }

    // Add parent attributes
    if (parentAttributes && parentAttributes.length > 0) {
      const productParentAttributes = parentAttributes.map((attr, index) => ({
        productId: product.id,
        name: attr.name,
        type: attr.type,
        values: attr.values,
        required: attr.required,
        sortOrder: index,
      }));

      await ProductAttribute.bulkCreate(productParentAttributes, {
        transaction,
      });
    }

    // Add legacy attributes (for backward compatibility)
    if (attributes && attributes.length > 0) {
      const productAttributes = attributes.map((attr) => ({
        ...attr,
        productId: product.id,
      }));

      await ProductAttribute.bulkCreate(productAttributes, { transaction });
    }

    // Add variants
    if (variants && variants.length > 0) {
      const productVariants = variants.map((variant, index) => ({
        productId: product.id,
        sku: variant.sku || `${product.id}-VAR-${index + 1}`,
        name: variant.name,
        price: parseFloat(variant.price) || 0,
        compareAtPrice: variant.compareAtPrice
          ? parseFloat(variant.compareAtPrice)
          : null,
        stockQuantity: parseInt(variant.stockQuantity || variant.stock) || 0,
        isDefault: variant.isDefault || index === 0, // First variant is default
        isAvailable: variant.isAvailable !== false,
        attributes: variant.attributes || {},
        attributeValues: variant.attributeValues || {},
        specifications: variant.specifications || {},
        images: variant.images || [],
        displayName: variant.displayName || variant.name || variant.name,
        sortOrder: variant.sortOrder || index,
      }));

      await ProductVariant.bulkCreate(productVariants, { transaction });
    }

    // Add warranty packages
    if (warrantyPackageIds && warrantyPackageIds.length > 0) {
      const { WarrantyPackage } = require('../models');
      const warranties = await WarrantyPackage.findAll({
        where: { id: { [Op.in]: warrantyPackageIds } },
      });

      if (warranties.length !== warrantyPackageIds.length) {
        throw new AppError('Một hoặc nhiều gói bảo hành không tồn tại', 400);
      }

      await product.setWarrantyPackages(warranties, { transaction });
    }

    await transaction.commit();

    // Get complete product with associations
    const createdProduct = await Product.findByPk(product.id, {
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'attributes',
        },
        {
          association: 'variants',
        },
        {
          association: 'productSpecifications',
        },
        {
          association: 'warrantyPackages',
          through: {
            attributes: ['isDefault'],
            as: 'productWarranty',
          },
          where: { isActive: true },
          required: false,
        },
      ],
    });

    res.status(201).json({
      status: 'success',
      data: createdProduct,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// Update product
const updateProduct = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      name,
      description,
      shortDescription,
      price,
      compareAtPrice,
      images,
      thumbnail,
      categoryIds,
      inStock,
      stockQuantity,
      featured,
      searchKeywords,
      seoTitle,
      seoDescription,
      seoKeywords,
      attributes,
      variants,
      warrantyPackageIds,
    } = req.body;


    // Find product
    const product = await Product.findByPk(id);
    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // Update product - chỉ cập nhật các trường có trong request
    const updateData = {};

    // Chỉ cập nhật các trường có trong request body
    if (req.body.hasOwnProperty('name')) updateData.name = name;
    if (req.body.hasOwnProperty('description'))
      updateData.description = description;
    if (req.body.hasOwnProperty('shortDescription'))
      updateData.shortDescription = shortDescription;
    if (req.body.hasOwnProperty('price')) updateData.price = price;
    if (req.body.hasOwnProperty('compareAtPrice'))
      updateData.compareAtPrice = compareAtPrice;
    // Removed comparePrice update as it's not in the Product model
    if (req.body.hasOwnProperty('images')) updateData.images = images;
    if (req.body.hasOwnProperty('thumbnail')) updateData.thumbnail = thumbnail;
    if (req.body.hasOwnProperty('inStock')) updateData.inStock = inStock;
    if (req.body.hasOwnProperty('stockQuantity'))
      updateData.stockQuantity = stockQuantity;
    if (req.body.hasOwnProperty('featured')) updateData.featured = featured;
    if (req.body.hasOwnProperty('searchKeywords'))
      updateData.searchKeywords = searchKeywords;
    if (req.body.hasOwnProperty('seoTitle')) updateData.seoTitle = seoTitle;
    if (req.body.hasOwnProperty('seoDescription'))
      updateData.seoDescription = seoDescription;
    if (req.body.hasOwnProperty('seoKeywords'))
      updateData.seoKeywords = seoKeywords;

    // Cập nhật sản phẩm với dữ liệu mới
    await product.update(updateData, { transaction });

    // Update categories - chỉ khi categoryIds được gửi trong request
    if (req.body.hasOwnProperty('categoryIds') && categoryIds) {
      const categories = await Category.findAll({
        where: { id: { [Op.in]: categoryIds } },
      });

      if (categories.length !== categoryIds.length) {
        throw new AppError('Một hoặc nhiều danh mục không tồn tại', 400);
      }

      await product.setCategories(categories, { transaction });
    }

    // Update attributes - chỉ khi attributes được gửi trong request
    if (req.body.hasOwnProperty('attributes')) {
      // Delete existing attributes
      await ProductAttribute.destroy({
        where: { productId: id },
        transaction,
      });

      // Create new attributes
      if (attributes && attributes.length > 0) {
        const productAttributes = attributes.map((attr) => ({
          ...attr,
          productId: id,
        }));

        await ProductAttribute.bulkCreate(productAttributes, { transaction });
      }
    }

    // Update variants - chỉ khi variants được gửi trong request
    if (req.body.hasOwnProperty('variants')) {
      // Delete existing variants
      await ProductVariant.destroy({
        where: { productId: id },
        transaction,
      });

      // Create new variants
      if (variants && variants.length > 0) {
        const productVariants = variants.map((variant) => ({
          ...variant,
          productId: id,
        }));

        await ProductVariant.bulkCreate(productVariants, { transaction });
      }
    }

    // Update warranty packages - chỉ khi warrantyPackageIds được gửi trong request
    if (req.body.hasOwnProperty('warrantyPackageIds')) {

      if (warrantyPackageIds && warrantyPackageIds.length > 0) {
        // Verify warranty packages exist
        const { WarrantyPackage } = require('../models');
        const warranties = await WarrantyPackage.findAll({
          where: { id: { [Op.in]: warrantyPackageIds } },
        });


        if (warranties.length !== warrantyPackageIds.length) {
          throw new AppError('Một hoặc nhiều gói bảo hành không tồn tại', 400);
        }

        await product.setWarrantyPackages(warranties, { transaction });
      } else {
        // Remove all warranty packages if empty array is sent
        await product.setWarrantyPackages([], { transaction });
      }
    } else {
    }

    await transaction.commit();

    // Get updated product with associations
    const updatedProduct = await Product.findByPk(id, {
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'attributes',
        },
        {
          association: 'variants',
        },
        {
          association: 'warrantyPackages',
          through: {
            attributes: ['isDefault'],
            as: 'productWarranty',
          },
          where: { isActive: true },
          required: false,
        },
      ],
    });

    res.status(200).json({
      status: 'success',
      data: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// Delete product
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find product
    const product = await Product.findByPk(id);
    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // Delete product
    await product.destroy();

    res.status(200).json({
      status: 'success',
      message: 'Xóa sản phẩm thành công',
    });
  } catch (error) {
    next(error);
  }
};

// Get featured products
const getFeaturedProducts = async (req, res, next) => {
  try {
    const { limit = 8 } = req.query;

    const productsRaw = await Product.findAll({
      where: { featured: true },
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'reviews',
          attributes: ['rating'],
        },
        {
          association: 'variants',
          attributes: ['id', 'name', 'price', 'stockQuantity', 'sku'],
        },
      ],
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']],
    });

    // Process products to add ratings
    const products = productsRaw.map((product) => {
      const productJson = product.toJSON();

      // Calculate average rating
      const ratings = {
        average: 0,
        count: 0,
      };

      if (productJson.reviews && productJson.reviews.length > 0) {
        const totalRating = productJson.reviews.reduce(
          (sum, review) => sum + review.rating,
          0
        );
        ratings.average = parseFloat(
          (totalRating / productJson.reviews.length).toFixed(1)
        );
        ratings.count = productJson.reviews.length;
      }

      // Use variant price if available, otherwise use product price
      let displayPrice = parseFloat(productJson.price) || 0;
      let compareAtPrice = parseFloat(productJson.compareAtPrice) || null;

      if (productJson.variants && productJson.variants.length > 0) {
        // Sort variants by price (ascending) to get the lowest price first
        const sortedVariants = productJson.variants.sort(
          (a, b) => parseFloat(a.price) - parseFloat(b.price)
        );
        displayPrice = parseFloat(sortedVariants[0].price) || displayPrice;
      }

      // Add ratings and remove reviews from response
      delete productJson.reviews;

      return {
        ...productJson,
        price: displayPrice,
        compareAtPrice,
        ratings,
      };
    });

    res.status(200).json({
      status: 'success',
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

// Get related products (V2: Two-list system)
const getRelatedProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit1 = 6, limit2 = 8, version = 'v2' } = req.query;

    // Import helper functions
    const {
      extractBrand,
      extractSkillLevel,
      extractKeySpecs,
      getBrandBasedRecommendations,
      getSkillBasedRecommendations,
      getSpecsBasedRecommendations,
      processRecommendations,
      // NEW: V2 functions
      getRelatedProductsV2,
      getYouMightLike
    } = require('../utils/badmintonRecommendationHelpers');

    // Lấy sản phẩm hiện tại với specifications
    const product = await Product.findByPk(id, {
      include: [
        { 
          association: 'categories',
          through: { attributes: [] }
        },
        {
          association: 'productSpecifications',
          attributes: ['name', 'value', 'category']
        }
      ]
    });

    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // NEW: Support both V1 (backward compatibility) and V2 (new 2-list system)
    if (version === 'v1') {
      // V1: Original unified system (backward compatibility)
      return await getRelatedProductsV1(product, req, res, next);
    }

    // V2: New 2-list system
    const [relatedProducts, youMightLike] = await Promise.all([
      getRelatedProductsV2(product, parseInt(limit1)),
      getYouMightLike(product, parseInt(limit2))
    ]);

    // NEW: Separate response structure
    res.status(200).json({
      status: 'success',
      data: {
        relatedProducts: relatedProducts,
        youMightLike: youMightLike
      },
      meta: {
        algorithm: 'badminton_two_list_recommendations',
        version: '2.0',
        currentProduct: {
          brand: extractBrand(product),
          skillLevel: extractSkillLevel(product),
          specs: extractKeySpecs(product),
          playStyle: require('../utils/badmintonRecommendationHelpers').extractPlayStyle(product)
        },
        counts: {
          related: relatedProducts.length,
          youMightLike: youMightLike.length,
          total: relatedProducts.length + youMightLike.length
        },
        pricing: {
          currentPrice: require('../utils/badmintonRecommendationHelpers').calculateDisplayPrice ? 
            require('../utils/badmintonRecommendationHelpers').calculateDisplayPrice(product).displayPrice : product.price,
          priceRange: {
            min: Math.round(product.price * 0.7),
            max: Math.round(product.price * 1.3)
          }
        }
      }
    });

  } catch (error) {
    console.error('Enhanced getRelatedProducts error:', error);
    next(error);
  }
};

// V1: Original unified system (for backward compatibility)
const getRelatedProductsV1 = async (product, req, res, next) => {
  const { id } = req.params;
  const { limit = 8 } = req.query;
  
  const {
    extractBrand,
    extractSkillLevel,
    extractKeySpecs,
    getBrandBasedRecommendations,
    getSkillBasedRecommendations,
    getSpecsBasedRecommendations,
    processRecommendations
  } = require('../utils/badmintonRecommendationHelpers');

  let recommendations = [];

  // 1. BRAND-BASED RECOMMENDATIONS (40% weight)
  const brandProducts = await getBrandBasedRecommendations(product);
  recommendations.push(...brandProducts.map(p => ({ 
    ...p, 
    source: 'brand', 
    weight: 0.4
  })));

  // 2. SKILL-BASED RECOMMENDATIONS (35% weight)
  const skillProducts = await getSkillBasedRecommendations(product);
  recommendations.push(...skillProducts.map(p => ({ 
    ...p, 
    source: 'skill', 
    weight: 0.35
  })));

  // 3. SPECS-BASED RECOMMENDATIONS (25% weight)
  const specsProducts = await getSpecsBasedRecommendations(product);
  recommendations.push(...specsProducts.map(p => ({ 
    ...p, 
    source: 'specs', 
    weight: 0.25
  })));

  // Fallback logic (kept as original)
  if (recommendations.length === 0) {
    console.log(`No smart recommendations found for product ${id}. Using fallback logic.`);
    
    const categoryIds = product.categories.map((category) => category.id);
    let fallbackProducts = [];

    if (categoryIds.length > 0) {
      fallbackProducts = await Product.findAll({
        attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
        include: [
          {
            association: 'categories',
            where: { id: { [Op.in]: categoryIds } },
            through: { attributes: [] },
          },
          {
            association: 'reviews',
            attributes: ['rating'],
          },
          {
            association: 'variants',
            attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
            required: false
          }
        ],
        where: {
          id: { [Op.ne]: id },
          status: 'active',
          inStock: true,
        },
        limit: parseInt(limit),
        order: [['createdAt', 'DESC']],
      });
    }

    if (fallbackProducts.length === 0) {
      fallbackProducts = await Product.findAll({
        attributes: ['id', 'name', 'slug', 'price', 'compareAtPrice', 'thumbnail', 'featured', 'inStock', 'stockQuantity', 'createdAt'],
        include: [
          {
            association: 'reviews',
            attributes: ['rating'],
          },
          {
            association: 'variants',
            attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
            required: false
          }
        ],
        where: {
          id: { [Op.ne]: id },
          status: 'active',
          inStock: true,
        },
        limit: parseInt(limit),
        order: [['featured', 'DESC'], ['createdAt', 'DESC']],
      });
    }

    recommendations = fallbackProducts.map(p => {
      const productJson = p.toJSON();
      const pricing = calculateActualPricing(productJson);
      
      return {
        ...productJson,
        source: 'category',
        weight: 0.1,
        reason: 'Sản phẩm cùng danh mục',
        price: pricing.actualPrice,
        compareAtPrice: pricing.actualCompareAtPrice,
        discountPercentage: pricing.discountPercentage
      };
    });
  }

  // Process and return results (V1 format)
  const finalProducts = processRecommendations(recommendations, id, limit);

  res.status(200).json({
    status: 'success',
    data: finalProducts,
    meta: {
      algorithm: 'badminton_smart_recommendations',
      version: '1.0',
      currentProduct: {
        brand: extractBrand(product),
        skillLevel: extractSkillLevel(product),
        specs: extractKeySpecs(product)
      },
      sources: {
        brand: finalProducts.filter(p => p.source === 'brand').length,
        skill: finalProducts.filter(p => p.source === 'skill').length,
        specs: finalProducts.filter(p => p.source === 'specs').length,
        category: finalProducts.filter(p => p.source === 'category').length
      }
    }
  });
};

// Search products
const searchProducts = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q) {
      throw new AppError('Từ khóa tìm kiếm là bắt buộc', 400);
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where: {
        name: { [Op.iLike]: `%${q}%` },
      },
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'variants',
          attributes: ['id', 'name', 'price', 'compareAtPrice', 'isDefault'],
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
        products,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get new arrivals
const getNewArrivals = async (req, res, next) => {
  try {
    const { limit = 8 } = req.query;

    const productsRaw = await Product.findAll({
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'reviews',
          attributes: ['rating'],
        },
      ],
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']],
    });

    // Process products to add ratings
    const products = productsRaw.map((product) => {
      const productJson = product.toJSON();

      // Calculate average rating
      const ratings = {
        average: 0,
        count: 0,
      };

      if (productJson.reviews && productJson.reviews.length > 0) {
        const totalRating = productJson.reviews.reduce(
          (sum, review) => sum + review.rating,
          0
        );
        ratings.average = parseFloat(
          (totalRating / productJson.reviews.length).toFixed(1)
        );
        ratings.count = productJson.reviews.length;
      }

      // Add ratings and remove reviews from response
      delete productJson.reviews;

      return {
        ...productJson,
        ratings,
      };
    });

    res.status(200).json({
      status: 'success',
      data: products,
    });
  } catch (error) {
    next(error);
  }
};


// Get deals (products with discounts)
const getDeals = async (req, res, next) => {
  try {
    const { minDiscount = 5, limit = 12, sort = 'discount_desc' } = req.query;

    // Get all products with variants and compareAtPrice (either on product or variants)
    const allProducts = await Product.findAll({
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'reviews',
          attributes: ['rating'],
        },
        {
          association: 'variants',
          attributes: ['id', 'name', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity'],
          required: false,
        },
      ],
    });

    // Calculate discount percentage and filter products
    const discountedProducts = allProducts
      .map((product) => {
        let price, compareAtPrice, selectedVariant = null;
        
        // Nếu product có variants, lấy giá từ variant
        if (product.variants && product.variants.length > 0) {
          // Tìm default variant trước
          selectedVariant = product.variants.find(v => v.isDefault) || product.variants[0];
          
          // Ưu tiên variant có compareAtPrice nếu có (cho deals)
          const variantWithDiscount = product.variants.find(v => 
            v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price)
          );
          if (variantWithDiscount) {
            selectedVariant = variantWithDiscount;
          }
          
          price = parseFloat(selectedVariant.price);
          compareAtPrice = parseFloat(selectedVariant.compareAtPrice || product.compareAtPrice || 0);
        } else {
          // Fallback về product price nếu không có variants
          price = parseFloat(product.price || 0);
          compareAtPrice = parseFloat(product.compareAtPrice || 0);
        }

        // Chỉ tính discount nếu có compareAtPrice và price hợp lệ
        if (!compareAtPrice || compareAtPrice <= price || price <= 0) {
          return null; // Loại bỏ sản phẩm không có discount
        }

        const discountPercentage = ((compareAtPrice - price) / compareAtPrice) * 100;

        // Calculate average rating
        const ratings = {
          average: 0,
          count: 0,
        };

        if (product.reviews && product.reviews.length > 0) {
          const totalRating = product.reviews.reduce(
            (sum, review) => sum + review.rating,
            0
          );
          ratings.average = parseFloat(
            (totalRating / product.reviews.length).toFixed(1)
          );
          ratings.count = product.reviews.length;
        }

        return {
          ...product.toJSON(),
          price, // Giá từ variant
          compareAtPrice, // Giá so sánh từ variant hoặc product
          discountPercentage,
          ratings,
          selectedVariant: selectedVariant ? {
            id: selectedVariant.id,
            name: selectedVariant.name,
            price: selectedVariant.price,
            compareAtPrice: selectedVariant.compareAtPrice,
            stockQuantity: selectedVariant.stockQuantity
          } : null,
        };
      })
      .filter(product => product !== null) // Loại bỏ sản phẩm null
      .filter(
        (product) => product.discountPercentage >= parseFloat(minDiscount)
      );

    // Sort products
    let sortedProducts;
    switch (sort) {
      case 'price_asc':
        sortedProducts = discountedProducts.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        sortedProducts = discountedProducts.sort((a, b) => b.price - a.price);
        break;
      case 'discount_desc':
      default:
        sortedProducts = discountedProducts.sort(
          (a, b) => b.discountPercentage - a.discountPercentage
        );
    }

    // Apply limit
    const limitedProducts = sortedProducts.slice(0, parseInt(limit));

    res.status(200).json({
      status: 'success',
      data: limitedProducts,
    });
  } catch (error) {
    next(error);
  }
};

// Get product variants
const getProductVariants = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find product
    const product = await Product.findByPk(id);
    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // Get variants
    const variants = await ProductVariant.findAll({
      where: { productId: id },
    });

    res.status(200).json({
      status: 'success',
      data: {
        variants,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get product reviews summary
const getProductReviewsSummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find product
    const product = await Product.findByPk(id);
    if (!product) {
      throw new AppError('Không tìm thấy sản phẩm', 404);
    }

    // Get reviews
    const reviews = await Review.findAll({
      where: { productId: id },
      attributes: ['rating'],
    });

    // Calculate summary
    const count = reviews.length;
    const average =
      count > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / count
        : 0;

    // Calculate distribution
    const distribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    reviews.forEach((review) => {
      distribution[review.rating]++;
    });

    res.status(200).json({
      status: 'success',
      data: {
        average,
        count,
        distribution,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get product filters
const getProductFilters = async (req, res, next) => {
  try {
    const { categoryId } = req.query;


    // Build where condition
    const whereCondition = {};
    const includeCondition = [];

    if (categoryId) {
      // Kiểm tra xem categoryId có phải là UUID hợp lệ không
      const isValidUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          categoryId
        );

      if (isValidUUID) {
        includeCondition.push({
          association: 'categories',
          where: { id: categoryId },
          through: { attributes: [] },
          required: false, // Đặt required: false để tránh lỗi khi không tìm thấy danh mục
        });
      } else {
        // Nếu không phải UUID, có thể là slug
        const category = await Category.findOne({
          where: { slug: categoryId },
        });
        if (category) {
          includeCondition.push({
            association: 'categories',
            where: { id: category.id },
            through: { attributes: [] },
            required: false,
          });
        }
      }
    }

    // Get price range
    const priceRange = await Product.findAll({
      attributes: [
        [sequelize.fn('MIN', sequelize.col('price')), 'min'],
        [sequelize.fn('MAX', sequelize.col('price')), 'max'],
      ],
      where: whereCondition,
      include: includeCondition,
      raw: true,
    });

    // Lấy category ID thực tế nếu có
    let actualCategoryId = null;
    if (categoryId) {
      const isValidUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          categoryId
        );
      if (isValidUUID) {
        actualCategoryId = categoryId;
      } else {
        const category = await Category.findOne({
          where: { slug: categoryId },
        });
        if (category) {
          actualCategoryId = category.id;
        }
      }
    }

    // Xây dựng điều kiện lọc sản phẩm theo danh mục
    let productFilter = {};
    if (actualCategoryId) {
      productFilter = {
        productId: {
          [Op.in]: sequelize.literal(
            `(SELECT product_id FROM product_categories WHERE category_id = '${actualCategoryId}')`
          ),
        },
      };
    }

    // Get brands
    const brands = await ProductAttribute.findAll({
      attributes: ['values'],
      where: {
        name: 'brand',
        ...(actualCategoryId ? productFilter : {}),
      },
      raw: true,
    });

    // Get colors
    const colors = await ProductAttribute.findAll({
      attributes: ['values'],
      where: {
        name: 'color',
        ...(actualCategoryId ? productFilter : {}),
      },
      raw: true,
    });

    // Get sizes
    const sizes = await ProductAttribute.findAll({
      attributes: ['values'],
      where: {
        name: 'size',
        ...(actualCategoryId ? productFilter : {}),
      },
      raw: true,
    });

    // Get other attributes
    const otherAttributes = await ProductAttribute.findAll({
      attributes: ['name', 'values'],
      where: {
        name: { [Op.notIn]: ['brand', 'color', 'size'] },
        ...(actualCategoryId ? productFilter : {}),
      },
      group: ['name', 'values'],
      raw: true,
    });

    // Xử lý dữ liệu trả về
    const uniqueBrands = new Set();
    brands.forEach((brand) => {
      if (brand.values && Array.isArray(brand.values)) {
        brand.values.forEach((value) => uniqueBrands.add(value));
      }
    });

    const uniqueColors = new Set();
    colors.forEach((color) => {
      if (color.values && Array.isArray(color.values)) {
        color.values.forEach((value) => uniqueColors.add(value));
      }
    });

    const uniqueSizes = new Set();
    sizes.forEach((size) => {
      if (size.values && Array.isArray(size.values)) {
        size.values.forEach((value) => uniqueSizes.add(value));
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        priceRange: {
          min: parseFloat(priceRange[0]?.min || 0),
          max: parseFloat(priceRange[0]?.max || 0),
        },
        brands: Array.from(uniqueBrands),
        colors: Array.from(uniqueColors),
        sizes: Array.from(uniqueSizes),
        attributes: otherAttributes.map((attr) => ({
          name: attr.name,
          values: attr.values || [],
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Debug endpoint để xem chi tiết recommendation logic
const debugRecommendations = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get current product với full data
    const currentProduct = await Product.findByPk(id, {
      include: [
        {
          association: 'categories',
          through: { attributes: [] },
        },
        {
          association: 'productSpecifications',
          attributes: ['name', 'value', 'category']
        },
        {
          association: 'variants',
          attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity']
        }
      ]
    });

    if (!currentProduct) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    // Get recommendations từng loại
    const {
      extractBrand,
      extractSkillLevel, 
      extractKeySpecs,
      getBrandBasedRecommendations,
      getSkillBasedRecommendations,
      getSpecsBasedRecommendations
    } = require('../utils/badmintonRecommendationHelpers');

    const currentBrand = extractBrand(currentProduct);
    const currentSkill = extractSkillLevel(currentProduct);
    const currentSpecs = extractKeySpecs(currentProduct);

    const [brandRecs, skillRecs, specsRecs] = await Promise.all([
      getBrandBasedRecommendations(currentProduct),
      getSkillBasedRecommendations(currentProduct), 
      getSpecsBasedRecommendations(currentProduct)
    ]);

    // Debug info
    const debugInfo = {
      currentProduct: {
        id: currentProduct.id,
        name: currentProduct.name,
        price: currentProduct.price,
        compareAtPrice: currentProduct.compareAtPrice,
        categories: currentProduct.categories?.map(c => ({
          name: c.name,
          level: c.level
        })),
        specifications: currentProduct.productSpecifications?.map(s => ({
          name: s.name,
          value: s.value,
          category: s.category
        })),
        variants: currentProduct.variants?.map(v => ({
          id: v.id,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          isDefault: v.isDefault,
          stockQuantity: v.stockQuantity
        }))
      },
      extracted: {
        brand: currentBrand,
        skillLevel: currentSkill,
        specs: currentSpecs
      },
      recommendations: {
        brand: {
          count: brandRecs.length,
          products: brandRecs.map(p => ({
            id: p.id,
            name: p.name,
            reason: p.reason,
            brandScore: p.brandScore,
            price: p.price,
            variants: p.variants
          }))
        },
        skill: {
          count: skillRecs.length,
          products: skillRecs.map(p => ({
            id: p.id,
            name: p.name,
            reason: p.reason,
            skillScore: p.skillScore,
            price: p.price,
            variants: p.variants
          }))
        },
        specs: {
          count: specsRecs.length,
          products: specsRecs.map(p => ({
            id: p.id,
            name: p.name,
            reason: p.reason,
            specScore: p.specScore,
            matchedSpec: p.matchedSpec,
            price: p.price,
            variants: p.variants
          }))
        }
      }
    };

    res.json({
      status: 'success',
      data: debugInfo
    });

  } catch (error) {
    console.error('Debug recommendations error:', error);
    next(error);
  }
};

// Debug endpoint để xem toàn bộ sản phẩm và specs  
const debugAllProducts = async (req, res, next) => {
  try {
    const products = await Product.findAll({
      attributes: ['id', 'name', 'price', 'compareAtPrice', 'inStock'],
      include: [
        {
          association: 'categories',
          attributes: ['name', 'level'],
          through: { attributes: [] }
        },
        {
          association: 'productSpecifications', 
          attributes: ['name', 'value', 'category']
        },
        {
          association: 'variants',
          attributes: ['id', 'price', 'compareAtPrice', 'isDefault', 'stockQuantity']
        }
      ],
      order: [['name', 'ASC']]
    });

    const summary = {
      totalProducts: products.length,
      productsByCategory: {},
      specificationTypes: {},
      skillLevels: {},
      flexibilityTypes: {},
      balanceTypes: {},
      products: products.map(p => {
        const specs = {};
        p.productSpecifications?.forEach(spec => {
          specs[spec.name] = spec.value;
        });
        
        return {
          id: p.id,
          name: p.name,
          price: p.price,
          inStock: p.inStock,
          categories: p.categories?.map(c => `${c.name} (L${c.level})`),
          specifications: specs,
          variantCount: p.variants?.length || 0,
          variantPrices: p.variants?.map(v => v.price) || []
        };
      })
    };

    // Thống kê categories
    products.forEach(p => {
      p.categories?.forEach(cat => {
        if (cat.level === 2) {
          summary.productsByCategory[cat.name] = (summary.productsByCategory[cat.name] || 0) + 1;
        }
      });
    });

    // Thống kê specifications
    products.forEach(p => {
      p.productSpecifications?.forEach(spec => {
        if (!summary.specificationTypes[spec.name]) {
          summary.specificationTypes[spec.name] = new Set();
        }
        summary.specificationTypes[spec.name].add(spec.value);
        
        // Thống kê riêng cho skill levels
        if (spec.name === 'Trình Độ Chơi') {
          summary.skillLevels[spec.value] = (summary.skillLevels[spec.value] || 0) + 1;
        }
        
        // Thống kê flexibility
        if (spec.name === 'Độ cứng đũa') {
          summary.flexibilityTypes[spec.value] = (summary.flexibilityTypes[spec.value] || 0) + 1;
        }
        
        // Thống kê balance
        if (spec.name === 'Điểm Cân Bằng') {
          summary.balanceTypes[spec.value] = (summary.balanceTypes[spec.value] || 0) + 1;
        }
      });
    });

    // Convert Sets to Arrays
    Object.keys(summary.specificationTypes).forEach(key => {
      summary.specificationTypes[key] = Array.from(summary.specificationTypes[key]);
    });

    res.json({
      status: 'success',
      data: summary
    });

  } catch (error) {
    console.error('Debug all products error:', error);
    next(error);
  }
};

// Get best selling products based on order quantity
const getBestSellers = async (req, res, next) => {
  try {
    const { limit = 12, period = 'month' } = req.query;
    const limitNum = parseInt(limit);

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get products with their total sales quantity
    
    const bestSellers = await sequelize.query(`
      SELECT 
        p.id,
        p.name,
        p.slug,
        p.description,
        p.short_description,
        p.price,
        p.compare_at_price,
        p.images,
        p.thumbnail,
        p.in_stock,
        p.stock_quantity,
        p.featured,
        p.created_at,
        p.updated_at,
        COALESCE(SUM(oi.quantity), 0) as total_sold,
        COALESCE(COUNT(DISTINCT oi.id), 0) as order_count,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COALESCE(COUNT(DISTINCT r.id), 0) as review_count
      FROM products p
      LEFT JOIN order_items oi ON p.id::text = oi.product_id::text
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'delivered' AND o.created_at >= $1
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE p.in_stock = true
      GROUP BY p.id, p.name, p.slug, p.description, p.short_description, 
               p.price, p.compare_at_price, p.images, p.thumbnail, 
               p.in_stock, p.stock_quantity, p.featured, p.created_at, p.updated_at
      ORDER BY total_sold DESC, order_count DESC, average_rating DESC
      LIMIT $2
    `, {
      bind: [startDate, limitNum],
      type: sequelize.QueryTypes.SELECT
    });

    // If no sales data, fall back to featured/highest rated products
    if (bestSellers.length === 0) {
      const fallbackProducts = await Product.findAll({
        include: [
          {
            model: Category,
            as: 'categories',
            attributes: ['id', 'name', 'slug'],
            through: { attributes: [] },
          },
          {
            model: ProductVariant,
            as: 'variants',
            required: false,
          },
          {
            model: Review,
            as: 'reviews',
            attributes: ['rating'],
          },
        ],
        where: {
          inStock: true,
          [Op.or]: [
            { featured: true },
            { '$reviews.rating$': { [Op.gte]: 4 } }
          ]
        },
        order: [
          ['featured', 'DESC'],
          [sequelize.literal('(SELECT AVG(rating) FROM reviews WHERE reviews.product_id = Product.id)'), 'DESC NULLS LAST'],
          ['createdAt', 'DESC']
        ],
        limit: limitNum,
        distinct: true
      });

      const processedFallback = fallbackProducts.map(product => {
        const productJson = product.toJSON();
        
        // Calculate ratings
        const ratings = { average: 0, count: 0 };
        if (productJson.reviews && productJson.reviews.length > 0) {
          const totalRating = productJson.reviews.reduce((sum, review) => sum + review.rating, 0);
          ratings.average = parseFloat((totalRating / productJson.reviews.length).toFixed(1));
          ratings.count = productJson.reviews.length;
        }

        // Calculate actual pricing
        const pricing = calculateActualPricing(productJson);
        
        // Use variant price if available
        let displayPrice = parseFloat(productJson.price) || 0;
        let compareAtPrice = parseFloat(productJson.compareAtPrice) || null;

        if (productJson.variants && productJson.variants.length > 0) {
          const sortedVariants = productJson.variants.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
          displayPrice = parseFloat(sortedVariants[0].price) || displayPrice;
        }

        // Remove reviews from response
        delete productJson.reviews;

        return {
          ...productJson,
          price: displayPrice,
          compareAtPrice,
          actualPrice: pricing.actualPrice,
          actualCompareAtPrice: pricing.actualCompareAtPrice,
          discountPercentage: pricing.discountPercentage,
          ratings,
          total_sold: 0,
          order_count: 0,
          average_rating: ratings.average,
          review_count: ratings.count,
          is_fallback: true
        };
      });

      return res.status(200).json({
        status: 'success',
        data: {
          total: processedFallback.length,
          products: processedFallback,
          period,
          message: 'No sales data available, showing featured products'
        }
      });
    }

    // Process best sellers with full product data
    const productIds = bestSellers.map(item => item.id);
    
    const fullProducts = await Product.findAll({
      where: { id: { [Op.in]: productIds } },
      include: [
        {
          model: Category,
          as: 'categories',
          attributes: ['id', 'name', 'slug'],
          through: { attributes: [] },
        },
        {
          model: ProductVariant,
          as: 'variants',
          required: false,
        },
      ],
    });

    // Merge sales data with full product data
    const processedProducts = bestSellers.map(saleData => {
      const fullProduct = fullProducts.find(p => p.id === saleData.id);
      if (!fullProduct) return null;

      const productJson = fullProduct.toJSON();
      
      // Calculate actual pricing
      const pricing = calculateActualPricing(productJson);
      
      // Use variant price if available
      let displayPrice = parseFloat(productJson.price) || 0;
      let compareAtPrice = parseFloat(productJson.compareAtPrice) || null;

      if (productJson.variants && productJson.variants.length > 0) {
        const sortedVariants = productJson.variants.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        displayPrice = parseFloat(sortedVariants[0].price) || displayPrice;
      }

      return {
        ...productJson,
        price: displayPrice,
        compareAtPrice,
        actualPrice: pricing.actualPrice,
        actualCompareAtPrice: pricing.actualCompareAtPrice,
        discountPercentage: pricing.discountPercentage,
        ratings: {
          average: parseFloat(saleData.average_rating) || 0,
          count: parseInt(saleData.review_count) || 0
        },
        // Best seller specific data
        total_sold: parseInt(saleData.total_sold),
        order_count: parseInt(saleData.order_count),
        is_best_seller: true
      };
    }).filter(Boolean);

    res.status(200).json({
      status: 'success',
      data: {
        total: processedProducts.length,
        products: processedProducts,
        period,
        date_range: {
          from: startDate.toISOString(),
          to: now.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Get best sellers error:', error);
    next(error);
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  getFeaturedProducts,
  getRelatedProducts,
  debugRecommendations,
  debugAllProducts,
  searchProducts,
  getNewArrivals,
  getBestSellers,
  getDeals,
  getProductVariants,
  getProductReviewsSummary,
  getProductFilters,
};
