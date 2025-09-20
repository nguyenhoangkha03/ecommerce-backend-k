const crypto = require('crypto');
const { User, Address, VietnameseLocation } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('../services/email/emailService');
const { Op } = require('sequelize');

// Update user profile
const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, avatar, email, gender, dateOfBirth } = req.body;
    const userId = req.user.id;

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError('Không tìm thấy người dùng', 404);
    }

    let emailUpdateMessage = null;

    // Handle email update for Facebook users
    if (email && email !== user.email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        where: { 
          email,
          id: { [Op.ne]: userId } // Exclude current user
        } 
      });
      
      if (existingUser) {
        throw new AppError('Email này đã được sử dụng bởi tài khoản khác', 400);
      }

      // Generate verification token for all users when changing email
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Update email and set as unverified
      user.email = email;
      user.isEmailVerified = false;
      user.verificationToken = verificationToken;
      
      // Send verification email
      await emailService.sendVerificationEmail(email, verificationToken);
      
      emailUpdateMessage = 'Email đã được cập nhật. Vui lòng kiểm tra email để xác thực tài khoản.';
    }

    // Update other user fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone !== undefined ? phone : user.phone;
    // Handle gender - allow null/empty for optional field
    if (gender !== undefined) {
      user.gender = (gender === '' || gender === null) ? null : gender;
    }
    
    // Handle dateOfBirth - allow null/empty for optional field
    if (dateOfBirth !== undefined) {
      if (dateOfBirth === '' || dateOfBirth === null) {
        user.dateOfBirth = null;
      } else {
        const parsedDate = new Date(dateOfBirth);
        if (!isNaN(parsedDate.getTime())) {
          user.dateOfBirth = dateOfBirth;
        }
        // If invalid date, keep existing value
      }
    }
    user.avatar = avatar || user.avatar;

    await user.save();

    const response = {
      status: 'success',
      data: user.toJSON(),
    };

    if (emailUpdateMessage) {
      response.message = emailUpdateMessage;
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

// Change password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError('Không tìm thấy người dùng', 404);
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new AppError('Mật khẩu hiện tại không đúng', 401);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Đổi mật khẩu thành công',
    });
  } catch (error) {
    next(error);
  }
};

// Get user addresses
const getAddresses = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find addresses with location details
    const addresses = await Address.findAll({
      where: { userId },
      include: [
        {
          model: VietnameseLocation,
          as: 'provinceLocation',
          attributes: ['id', 'name', 'code']
        },
        {
          model: VietnameseLocation,
          as: 'districtLocation',
          attributes: ['id', 'name', 'code']
        },
        {
          model: VietnameseLocation,
          as: 'wardLocation',
          attributes: ['id', 'name', 'code']
        }
      ],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    res.status(200).json({
      status: 'success',
      data: addresses,
    });
  } catch (error) {
    next(error);
  }
};

// Add new address
const addAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressData = req.body;

    // Check if this is the first address
    const addressCount = await Address.count({ where: { userId } });
    if (addressCount === 0) {
      addressData.isDefault = true;
    }

    // If setting as default, update other addresses FIRST
    if (addressData.isDefault) {
      await Address.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    }

    // Create address
    const address = await Address.create({
      ...addressData,
      userId,
    });

    res.status(201).json({
      status: 'success',
      data: address,
    });
  } catch (error) {
    next(error);
  }
};

// Update address
const updateAddress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const addressData = req.body;

    // Find address
    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      throw new AppError('Không tìm thấy địa chỉ', 404);
    }

    // Handle default address logic
    if (addressData.isDefault && !address.isDefault) {
      // Setting new default - remove default from others
      await Address.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    } else if (!addressData.isDefault && address.isDefault) {
      // Removing default from current address - must set another as default
      const addressCount = await Address.count({ where: { userId } });
      if (addressCount > 1) {
        // Find another address to set as default
        const anotherAddress = await Address.findOne({
          where: { userId, id: { [Op.ne]: id } },
          order: [['createdAt', 'ASC']]
        });
        if (anotherAddress) {
          await anotherAddress.update({ isDefault: true });
        }
      } else {
        // If this is the only address, keep it as default
        addressData.isDefault = true;
      }
    }

    // Update address
    await address.update(addressData);

    res.status(200).json({
      status: 'success',
      data: address,
    });
  } catch (error) {
    next(error);
  }
};

// Delete address
const deleteAddress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find address
    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      throw new AppError('Không tìm thấy địa chỉ', 404);
    }

    // Delete address
    await address.destroy();

    // If deleted address was default, set another address as default
    if (address.isDefault) {
      const anotherAddress = await Address.findOne({
        where: { userId },
        order: [['createdAt', 'DESC']],
      });

      if (anotherAddress) {
        anotherAddress.isDefault = true;
        await anotherAddress.save();
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Xóa địa chỉ thành công',
    });
  } catch (error) {
    next(error);
  }
};

// Set default address
const setDefaultAddress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find address
    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      throw new AppError('Không tìm thấy địa chỉ', 404);
    }

    // Update other addresses
    await Address.update(
      { isDefault: false },
      { where: { userId, isDefault: true } }
    );

    // Set as default
    address.isDefault = true;
    await address.save();

    res.status(200).json({
      status: 'success',
      data: address,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
  changePassword,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
