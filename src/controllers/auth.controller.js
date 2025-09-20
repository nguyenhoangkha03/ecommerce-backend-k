const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('../services/email/emailService');
const facebookService = require('../services/facebookService');
const googleService = require('../services/googleService');
const { Op } = require('sequelize');

// Register a new user
const register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError('Email đã được sử dụng', 400);
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create new user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone,
      verificationToken,
    });

    // Send verification email
    await emailService.sendVerificationEmail(user.email, verificationToken);

    res.status(201).json({
      status: 'success',
      message:
        'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
    });
  } catch (error) {
    next(error);
  }
};

// Login user
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    // Check if email is verified (TEMPORARILY DISABLED FOR TESTING)
    // if (!user.isEmailVerified) {
    //   throw new AppError('Vui lòng xác thực email trước khi đăng nhập', 401);
    // }

    // Check if account is active
    if (!user.isActive) {
      throw new AppError(
        'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
        401
      );
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    res.status(200).json({
      status: 'success',
      token,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

// Logout user
const logout = async (req, res, next) => {
  try {
    // In a real implementation, you might want to invalidate the token
    // by adding it to a blacklist or using Redis to store invalidated tokens

    // For now, we'll just return a 204 No Content response
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// Verify email
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    // Find user with token
    const user = await User.findOne({ where: { verificationToken: token } });

    if (!user) {
      throw new AppError('Token không hợp lệ hoặc đã hết hạn', 400);
    }

    // Update user
    user.isEmailVerified = true;
    user.verificationToken = null;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Xác thực email thành công. Bạn có thể đăng nhập ngay bây giờ.',
    });
  } catch (error) {
    next(error);
  }
};

// Verify email with token (POST method)
const verifyEmailWithToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    // Find user with token
    const user = await User.findOne({ where: { verificationToken: token } });
    if (!user) {
      throw new AppError('Token không hợp lệ hoặc đã hết hạn', 400);
    }

    // Update user
    user.isEmailVerified = true;
    user.verificationToken = null;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Xác thực email thành công. Bạn có thể đăng nhập ngay bây giờ.',
    });
  } catch (error) {
    next(error);
  }
};

// Resend verification email
const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AppError('Không tìm thấy tài khoản với email này', 404);
    }

    // Check if email is already verified
    if (user.isEmailVerified) {
      throw new AppError('Email đã được xác thực', 400);
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Update user
    user.verificationToken = verificationToken;
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(user.email, verificationToken);

    res.status(200).json({
      status: 'success',
      message: 'Đã gửi lại email xác thực. Vui lòng kiểm tra email của bạn.',
    });
  } catch (error) {
    next(error);
  }
};

// Refresh token
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token là bắt buộc', 401);
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user
    const user = await User.findByPk(decoded.id);
    if (!user) {
      throw new AppError('Refresh token không hợp lệ', 401);
    }

    // Check if account is active
    if (!user.isActive) {
      throw new AppError(
        'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
        401
      );
    }

    // Generate new access token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      status: 'success',
      token,
    });
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return next(
        new AppError('Refresh token không hợp lệ hoặc đã hết hạn', 401)
      );
    }
    next(error);
  }
};

// Forgot password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AppError('Không tìm thấy tài khoản với email này', 404);
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = Date.now() + 3600000; // 1 hour

    // Update user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(resetTokenExpires);
    await user.save();

    // Send reset password email
    await emailService.sendResetPasswordEmail(user.email, resetToken);

    res.status(200).json({
      status: 'success',
      message:
        'Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra email của bạn.',
    });
  } catch (error) {
    next(error);
  }
};

// Reset password
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    // Find user with token
    const user = await User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw new AppError('Token không hợp lệ hoặc đã hết hạn', 400);
    }

    // Update user
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({
      status: 'success',
      message:
        'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập ngay bây giờ.',
    });
  } catch (error) {
    next(error);
  }
};

// Facebook login
const facebookLogin = async (req, res, next) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      throw new AppError('Facebook access token là bắt buộc', 400);
    }

    // Verify Facebook token and get user data
    const facebookUser = await facebookService.verifyToken(accessToken);

    // Handle case when Facebook user doesn't share email
    if (!facebookUser.email) {
      facebookUser.email = `facebook_${facebookUser.id}@temporary.com`;
    }

    // Check if user already exists - prioritize facebookId lookup
    let user = await User.findOne({
      where: { facebookId: facebookUser.id }
    });

    // If not found by facebookId and has real email (not temporary)
    if (!user && !facebookUser.email.includes('@temporary.com')) {
      user = await User.findOne({
        where: { email: facebookUser.email }
      });
    }

    if (user) {
      // Always update Facebook data and avatar on each login
      let shouldUpdate = false;
      
      if (!user.facebookId) {
        user.facebookId = facebookUser.id;
        shouldUpdate = true;
      }
      
      // Update social providers data (including fresh picture URL)
      const currentFacebookData = user.socialProviders?.facebook || {};
      const newFacebookData = {
        id: facebookUser.id,
        name: facebookUser.name,
        picture: facebookUser.picture?.data?.url,
      };
      
      // Update if Facebook data has changed
      if (JSON.stringify(currentFacebookData) !== JSON.stringify(newFacebookData)) {
        user.socialProviders = {
          ...user.socialProviders,
          facebook: newFacebookData,
        };
        shouldUpdate = true;
      }
      
      // Always try to download Facebook profile picture to server 
      if (facebookUser.id) {
        console.log('Attempting to download Facebook profile picture for user:', user.id);
        console.log('Current user avatar:', user.avatar);
        
        try {
          const localAvatarPath = await facebookService.downloadProfilePicture(facebookUser.id, accessToken);
          
          if (localAvatarPath) {
            console.log('Successfully downloaded Facebook avatar:', localAvatarPath);
            user.avatar = localAvatarPath;
            shouldUpdate = true;
          } else {
            console.log('Failed to download Facebook avatar, keeping current');
          }
        } catch (downloadError) {
          console.error('Error downloading Facebook profile picture:', downloadError.message);
        }
      }
      
      if (shouldUpdate) {
        await user.save();
      }
    } else {
      // Create new user from Facebook data
      const userData = facebookService.formatUserData(facebookUser);
      
      // Try to download Facebook profile picture for new user
      try {
        const localAvatarPath = await facebookService.downloadProfilePicture(facebookUser.id, accessToken);
        if (localAvatarPath) {
          console.log('Downloaded Facebook avatar for new user:', localAvatarPath);
          userData.avatar = localAvatarPath;
        }
      } catch (downloadError) {
        console.error('Error downloading Facebook profile picture for new user:', downloadError.message);
      }
      
      user = await User.create(userData);
    }

    // Check if account is active
    if (!user.isActive) {
      throw new AppError(
        'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
        401
      );
    }

    // Generate JWT tokens
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    res.status(200).json({
      status: 'success',
      token,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

// Get current user
const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          association: 'addresses',
          attributes: { exclude: ['userId'] },
        },
      ],
    });

    if (!user) {
      throw new AppError('Không tìm thấy người dùng', 404);
    }

    res.status(200).json({
      status: 'success',
      data: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

// Google login
const googleLogin = async (req, res, next) => {
  try {
    const { idToken, accessToken } = req.body;

    if (!idToken && !accessToken) {
      throw new AppError('Google token là bắt buộc', 400);
    }

    let googleUser;

    // Try to verify ID token first (preferred method)
    if (idToken && idToken !== accessToken) {
      try {
        googleUser = await googleService.verifyToken(idToken);
      } catch (error) {
        console.log('ID token verification failed, trying access token method');
        if (accessToken) {
          googleUser = await googleService.getUserInfo(accessToken);
        } else {
          throw error;
        }
      }
    } else if (accessToken) {
      // Use access token method
      googleUser = await googleService.getUserInfo(accessToken);
    }

    // Handle case when Google user doesn't share email
    if (!googleUser.email) {
      throw new AppError('Không thể lấy thông tin email từ Google', 400);
    }

    // Check if user already exists - prioritize googleId lookup
    let user = await User.findOne({
      where: { googleId: googleUser.sub || googleUser.id }
    });

    // If not found by googleId, try email lookup
    if (!user) {
      user = await User.findOne({
        where: { email: googleUser.email }
      });
    }

    if (user) {
      // Always update existing user with latest Google data
      let needsUpdate = false;
      
      if (!user.googleId) {
        user.googleId = googleUser.sub || googleUser.id;
        needsUpdate = true;
      }
      
      // Always update avatar with latest Google profile picture
      if (googleUser.picture && user.avatar !== googleUser.picture) {
        user.avatar = googleUser.picture;
        needsUpdate = true;
      }
      
      // Update social providers data
      user.socialProviders = {
        ...user.socialProviders,
        google: {
          id: googleUser.sub || googleUser.id,
          name: googleUser.name,
          picture: googleUser.picture,
          locale: googleUser.locale,
        },
      };
      needsUpdate = true;
      
      if (needsUpdate) {
        await user.save();
      }
    } else {
      // Create new user from Google data
      const userData = googleService.formatUserData(googleUser);
      user = await User.create(userData);
    }

    // Check if account is active
    if (!user.isActive) {
      throw new AppError(
        'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
        401
      );
    }

    // Generate JWT tokens
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    res.status(200).json({
      status: 'success',
      token,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  verifyEmailWithToken,
  resendVerification,
  refreshToken,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  facebookLogin,
  googleLogin,
};
