const axios = require('axios');

class FacebookService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v18.0';
  }

  /**
   * Verify Facebook access token and get user info
   * @param {string} accessToken - Facebook access token
   * @returns {Object} User information from Facebook
   */
  async verifyToken(accessToken) {
    try {
      // Verify token with Facebook Graph API
      const response = await axios.get(`${this.baseURL}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,email,first_name,last_name,name,picture.type(large)',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Facebook token verification failed:', error.response?.data || error.message);
      throw new Error('Invalid Facebook token');
    }
  }

  /**
   * Verify app access token (optional security check)
   * @param {string} accessToken - Facebook access token
   * @returns {Object} Token verification result
   */
  async inspectToken(accessToken) {
    try {
      const appToken = process.env.FACEBOOK_APP_TOKEN;
      if (!appToken) {
        throw new Error('Facebook app token not configured');
      }

      const response = await axios.get(`${this.baseURL}/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: appToken,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Facebook token inspection failed:', error.response?.data || error.message);
      throw new Error('Failed to inspect Facebook token');
    }
  }

  /**
   * Get user's profile picture URL
   * @param {string} facebookId - Facebook user ID
   * @returns {string} Profile picture URL
   */
  async getProfilePicture(facebookId) {
    try {
      const response = await axios.get(`${this.baseURL}/${facebookId}/picture`, {
        params: {
          type: 'large',
          redirect: false,
        },
      });

      return response.data.data.url;
    } catch (error) {
      console.error('Failed to get Facebook profile picture:', error.message);
      return null;
    }
  }

  /**
   * Download Facebook profile picture to server
   * @param {string} facebookId - Facebook user ID
   * @param {string} accessToken - Facebook access token
   * @returns {string|null} Local avatar URL or null if failed
   */
  async downloadProfilePicture(facebookId, accessToken) {
    try {
      const fs = require('fs');
      const path = require('path');
      const crypto = require('crypto');

      // Create unique filename
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(facebookId).digest('hex').substring(0, 8);
      const filename = `facebook_${hash}_${timestamp}.jpg`;
      const uploadDir = path.join(__dirname, '../../public/uploads/users');
      const filePath = path.join(uploadDir, filename);
      
      console.log('Upload directory:', uploadDir);
      console.log('File path:', filePath);

      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Try multiple Facebook picture URLs
      const urls = [
        `https://graph.facebook.com/v18.0/${facebookId}/picture?type=large&width=400&height=400&access_token=${accessToken}`,
        `https://graph.facebook.com/${facebookId}/picture?type=large&width=400&height=400`,
        `https://graph.facebook.com/${facebookId}/picture?type=large&access_token=${accessToken}`,
        `https://graph.facebook.com/${facebookId}/picture?type=large`,
      ];
      
      console.log(`Starting download for Facebook ID: ${facebookId}`);

      for (const url of urls) {
        try {
          console.log(`Trying to download Facebook picture from: ${url}`);
          
          const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; BadmintonShop/1.0)',
            },
          });

          // Check if response is actually an image
          const contentType = response.headers['content-type'];
          if (!contentType || !contentType.startsWith('image/')) {
            console.log(`Invalid content type: ${contentType}`);
            continue;
          }

          // Save image to file
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          // Verify file was created and has content
          if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            const relativePath = `/uploads/users/${filename}`;
            console.log(`Successfully downloaded Facebook picture to: ${relativePath}`);
            return relativePath;
          } else {
            console.log('File was created but is empty or invalid');
          }
        } catch (urlError) {
          console.log(`Failed to download from ${url}:`, urlError.message);
          continue;
        }
      }

      // Clean up empty file if exists
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return null;
    } catch (error) {
      console.error('Error downloading Facebook profile picture:', error.message);
      return null;
    }
  }

  /**
   * Format Facebook user data for our system
   * @param {Object} facebookUser - User data from Facebook
   * @returns {Object} Formatted user data
   */
  formatUserData(facebookUser) {
    return {
      facebookId: facebookUser.id,
      email: facebookUser.email,
      firstName: facebookUser.first_name,
      lastName: facebookUser.last_name,
      avatar: facebookUser.picture?.data?.url,
      provider: 'facebook',
      isEmailVerified: true, // Facebook emails are pre-verified
      socialProviders: {
        facebook: {
          id: facebookUser.id,
          name: facebookUser.name,
          picture: facebookUser.picture?.data?.url,
        },
      },
    };
  }
}

module.exports = new FacebookService();