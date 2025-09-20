const { Contact } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const { Op } = require('sequelize');

// Create new contact message
const createContact = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return next(new AppError('Tất cả các trường đều bắt buộc', 400));
    }

    // Create contact
    const contact = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject,
      message: message.trim(),
    });

    res.status(201).json({
      status: 'success',
      message: 'Tin nhắn của bạn đã được gửi thành công. Chúng tôi sẽ phản hồi sớm nhất có thể.',
      data: {
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          subject: contact.subject,
          message: contact.message,
          status: contact.status,
          createdAt: contact.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errorMessage = error.errors.map(err => err.message).join(', ');
      return next(new AppError(errorMessage, 400));
    }
    
    return next(new AppError('Có lỗi xảy ra khi gửi tin nhắn. Vui lòng thử lại sau.', 500));
  }
};

// Get all contacts (Admin only)
const getAllContacts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      subject,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query;

    const whereConditions = {};

    // Filter by status
    if (status) {
      whereConditions.status = status;
    }

    // Filter by subject
    if (subject) {
      whereConditions.subject = subject;
    }

    // Search filter
    if (search) {
      whereConditions[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { message: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * limit;

    // Map frontend field names to database field names
    const fieldMap = {
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'isRead': 'is_read',
      'adminNotes': 'admin_notes',
      'respondedAt': 'responded_at'
    };
    
    const dbSortBy = fieldMap[sortBy] || sortBy;
    
    const { count, rows: contacts } = await Contact.findAndCountAll({
      where: whereConditions,
      order: [[dbSortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      status: 'success',
      data: {
        contacts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Error getting contacts:', error);
    return next(new AppError('Có lỗi xảy ra khi lấy danh sách liên hệ', 500));
  }
};

// Get single contact by ID (Admin only)
const getContactById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return next(new AppError('Không tìm thấy tin nhắn liên hệ', 404));
    }

    // Mark as read when admin views it
    if (!contact.isRead) {
      await contact.update({ isRead: true });
    }

    res.status(200).json({
      status: 'success',
      data: { contact },
    });
  } catch (error) {
    console.error('Error getting contact:', error);
    return next(new AppError('Có lỗi xảy ra khi lấy thông tin liên hệ', 500));
  }
};

// Update contact status (Admin only)
const updateContactStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, priority } = req.body;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return next(new AppError('Không tìm thấy tin nhắn liên hệ', 404));
    }

    const updateData = {};

    if (status) {
      updateData.status = status;
      if (status === 'resolved' && !contact.respondedAt) {
        updateData.respondedAt = new Date();
      }
    }

    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }

    if (priority) {
      updateData.priority = priority;
    }

    const updatedContact = await contact.update(updateData);

    res.status(200).json({
      status: 'success',
      message: 'Cập nhật trạng thái liên hệ thành công',
      data: { contact: updatedContact },
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    
    if (error.name === 'SequelizeValidationError') {
      const errorMessage = error.errors.map(err => err.message).join(', ');
      return next(new AppError(errorMessage, 400));
    }
    
    return next(new AppError('Có lỗi xảy ra khi cập nhật liên hệ', 500));
  }
};

// Delete contact (Admin only)
const deleteContact = async (req, res, next) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return next(new AppError('Không tìm thấy tin nhắn liên hệ', 404));
    }

    await contact.destroy();

    res.status(200).json({
      status: 'success',
      message: 'Xóa tin nhắn liên hệ thành công',
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return next(new AppError('Có lỗi xảy ra khi xóa liên hệ', 500));
  }
};

// Get contact statistics (Admin only)
const getContactStats = async (req, res, next) => {
  try {
    const [
      totalContacts,
      pendingContacts,
      inProgressContacts,
      resolvedContacts,
      unreadContacts,
    ] = await Promise.all([
      Contact.count(),
      Contact.count({ where: { status: 'pending' } }),
      Contact.count({ where: { status: 'in_progress' } }),
      Contact.count({ where: { status: 'resolved' } }),
      Contact.count({ where: { isRead: false } }),
    ]);

    // Get contact counts by subject
    const subjectStats = await Contact.findAll({
      attributes: [
        'subject',
        [Contact.sequelize.fn('COUNT', Contact.sequelize.col('id')), 'count'],
      ],
      group: ['subject'],
      raw: true,
    });

    // Get recent contacts (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentContacts = await Contact.count({
      where: {
        createdAt: {
          [Op.gte]: sevenDaysAgo,
        },
      },
    });

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          total: totalContacts,
          pending: pendingContacts,
          inProgress: inProgressContacts,
          resolved: resolvedContacts,
          unread: unreadContacts,
          recent: recentContacts,
        },
        bySubject: subjectStats,
      },
    });
  } catch (error) {
    console.error('Error getting contact stats:', error);
    return next(new AppError('Có lỗi xảy ra khi lấy thống kê liên hệ', 500));
  }
};

module.exports = {
  createContact,
  getAllContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
  getContactStats,
};