const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const News = sequelize.define(
  'News',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    excerpt: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    featuredImage: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'featured_image',
    },
    author: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Admin',
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'published',
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    viewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'view_count',
    },
    seoTitle: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'seo_title',
    },
    seoDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'seo_description',
    },
  },
  {
    tableName: 'news',
    timestamps: true,
    hooks: {
      beforeCreate: (news) => {
        if (!news.publishedAt && news.status === 'published') {
          news.publishedAt = new Date();
        }
      },
      beforeUpdate: (news) => {
        if (news.changed('status') && news.status === 'published' && !news.publishedAt) {
          news.publishedAt = new Date();
        }
      },
    },
  }
);

module.exports = News;