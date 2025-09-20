const { News } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const { Op } = require('sequelize');
const slugify = require('slugify');

// Helper function to clean HTML content
const cleanHtmlContent = (content) => {
  if (!content) return content;
  
  // Fix multiple encoding issues
  let cleaned = content;
  
  // Fix common HTML encoding issues
  cleaned = cleaned.replace(/&amp;lt;/g, '<');
  cleaned = cleaned.replace(/&amp;gt;/g, '>');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&amp;/g, '&');
  
  return cleaned;
};

// Get all news with pagination
const getAllNews = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
    } = req.query;

    const whereConditions = {};
    
    // If status is specified, filter by it
    if (status) {
      whereConditions.status = status;
    } else if (!req.user || req.user.role !== 'admin') {
      // For non-admin users, only show published when no status specified
      whereConditions.status = 'published';
    }
    // If admin and no status specified, show all (no status filter)

    // Search filter
    if (search) {
      whereConditions[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { excerpt: { [Op.iLike]: `%${search}%` } },
        { content: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: news } = await News.findAndCountAll({
      where: whereConditions,
      order: [['publishedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.status(200).json({
      status: 'success',
      data: {
        news,
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
        currentPage: parseInt(page),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get latest news for homepage
const getLatestNews = async (req, res, next) => {
  try {
    const { limit = 4 } = req.query;

    const news = await News.findAll({
      where: { status: 'published' },
      order: [['publishedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      attributes: ['id', 'title', 'slug', 'excerpt', 'featuredImage', 'publishedAt', 'author'],
    });

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error) {
    next(error);
  }
};

// Get news by ID
const getNewsById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const news = await News.findByPk(id);
    if (!news) {
      throw new AppError('Không tìm thấy bài viết', 404);
    }

    // Increment view count
    await news.increment('viewCount');

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error) {
    next(error);
  }
};

// Get news by slug
const getNewsBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const news = await News.findOne({ where: { slug } });
    if (!news) {
      throw new AppError('Không tìm thấy bài viết', 404);
    }

    // Increment view count
    await news.increment('viewCount');

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error) {
    next(error);
  }
};

// Create news (Admin only)
const createNews = async (req, res, next) => {
  try {
    const {
      title,
      excerpt,
      content,
      featuredImage,
      author,
      status,
      tags,
      seoTitle,
      seoDescription,
    } = req.body;

    // Generate slug
    const slug = slugify(title, { lower: true, strict: true });

    // Check if slug exists
    const existingNews = await News.findOne({ where: { slug } });
    if (existingNews) {
      throw new AppError('Tiêu đề bài viết đã tồn tại', 400);
    }

    const news = await News.create({
      title,
      slug,
      excerpt,
      content: cleanHtmlContent(content),
      featuredImage,
      author,
      status,
      tags,
      seoTitle,
      seoDescription,
    });

    res.status(201).json({
      status: 'success',
      data: news,
    });
  } catch (error) {
    next(error);
  }
};

// Update news (Admin only)
const updateNews = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const news = await News.findByPk(id);
    if (!news) {
      throw new AppError('Không tìm thấy bài viết', 404);
    }

    // Update slug if title changed
    if (updateData.title && updateData.title !== news.title) {
      const newSlug = slugify(updateData.title, { lower: true, strict: true });
      const existingNews = await News.findOne({ 
        where: { 
          slug: newSlug,
          id: { [Op.ne]: id }
        } 
      });
      if (existingNews) {
        throw new AppError('Tiêu đề bài viết đã tồn tại', 400);
      }
      updateData.slug = newSlug;
    }

    // Clean content if provided
    if (updateData.content) {
      updateData.content = cleanHtmlContent(updateData.content);
    }

    await news.update(updateData);

    res.status(200).json({
      status: 'success',
      data: news,
    });
  } catch (error) {
    next(error);
  }
};

// Delete news (Admin only)
const deleteNews = async (req, res, next) => {
  try {
    const { id } = req.params;

    const news = await News.findByPk(id);
    if (!news) {
      throw new AppError('Không tìm thấy bài viết', 404);
    }

    await news.destroy();

    res.status(200).json({
      status: 'success',
      message: 'Đã xóa bài viết thành công',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllNews,
  getLatestNews,
  getNewsById,
  getNewsBySlug,
  createNews,
  updateNews,
  deleteNews,
};