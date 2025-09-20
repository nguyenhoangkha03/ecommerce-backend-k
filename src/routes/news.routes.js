const express = require('express');
const router = express.Router();
const newsController = require('../controllers/news.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');

/**
 * @swagger
 * tags:
 *   name: News
 *   description: News management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     News:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: News ID
 *         title:
 *           type: string
 *           description: News title
 *         slug:
 *           type: string
 *           description: News slug for SEO-friendly URLs
 *         excerpt:
 *           type: string
 *           description: Short excerpt
 *         content:
 *           type: string
 *           description: Full content
 *         featuredImage:
 *           type: string
 *           description: Featured image URL
 *         author:
 *           type: string
 *           description: Author name
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           description: News status
 *         publishedAt:
 *           type: string
 *           format: date-time
 *           description: Published date
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: News tags
 *         viewCount:
 *           type: integer
 *           description: View count
 */

/**
 * @swagger
 * /api/news:
 *   get:
 *     summary: Get all news with pagination
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           default: published
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of news
 */
// Use optional authentication to detect admin users
const optionalAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token invalid, continue without user
    }
  }
  next();
};

router.get('/', optionalAuth, newsController.getAllNews);

/**
 * @swagger
 * /api/news/latest:
 *   get:
 *     summary: Get latest news for homepage
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 4
 *     responses:
 *       200:
 *         description: Latest news
 */
router.get('/latest', newsController.getLatestNews);

/**
 * @swagger
 * /api/news/slug/{slug}:
 *   get:
 *     summary: Get news by slug
 *     tags: [News]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: News details
 *       404:
 *         description: News not found
 */
router.get('/slug/:slug', newsController.getNewsBySlug);

/**
 * @swagger
 * /api/news/{id}:
 *   get:
 *     summary: Get news by ID
 *     tags: [News]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: News details
 *       404:
 *         description: News not found
 */
router.get('/:id', newsController.getNewsById);

/**
 * @swagger
 * /api/news:
 *   post:
 *     summary: Create news (Admin only)
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - excerpt
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               excerpt:
 *                 type: string
 *               content:
 *                 type: string
 *               featuredImage:
 *                 type: string
 *               author:
 *                 type: string
 *               status:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: News created successfully
 */
router.post(
  '/',
  authenticate,
  requirePermission('news', 'create'),
  newsController.createNews
);

/**
 * @swagger
 * /api/news/{id}:
 *   put:
 *     summary: Update news (Admin only)
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: News updated successfully
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('news', 'update'),
  newsController.updateNews
);

/**
 * @swagger
 * /api/news/{id}:
 *   delete:
 *     summary: Delete news (Admin only)
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: News deleted successfully
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('news', 'delete'),
  newsController.deleteNews
);

module.exports = router;