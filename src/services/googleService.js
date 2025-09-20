const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

class GoogleService {
  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
  }

  /**
   * Verify Google access token and get user info
   * @param {string} idToken - Google ID token
   * @returns {Object} User information from Google
   */
  async verifyToken(idToken) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      return payload;
    } catch (error) {
      console.error('Google token verification failed:', error.message);
      throw new Error('Invalid Google token');
    }
  }

  /**
   * Get user info using access token (alternative method)
   * @param {string} accessToken - Google access token
   * @returns {Object} User information from Google
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get Google user info:', error.response?.data || error.message);
      throw new Error('Failed to get user information from Google');
    }
  }

  /**
   * Verify access token with Google's tokeninfo endpoint
   * @param {string} accessToken - Google access token
   * @returns {Object} Token verification result
   */
  async verifyAccessToken(accessToken) {
    try {
      const response = await axios.get(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
      
      // Check if token is for our application
      if (response.data.audience !== process.env.GOOGLE_CLIENT_ID) {
        throw new Error('Token audience mismatch');
      }

      return response.data;
    } catch (error) {
      console.error('Google access token verification failed:', error.response?.data || error.message);
      throw new Error('Invalid Google access token');
    }
  }

  /**
   * Format Google user data for our system
   * @param {Object} googleUser - User data from Google
   * @returns {Object} Formatted user data
   */
  formatUserData(googleUser) {
    return {
      googleId: googleUser.sub || googleUser.id,
      email: googleUser.email,
      firstName: googleUser.given_name || googleUser.name?.split(' ')[0] || '',
      lastName: googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '',
      avatar: googleUser.picture,
      provider: 'google',
      isEmailVerified: googleUser.email_verified !== false, // Google emails are usually pre-verified
      socialProviders: {
        google: {
          id: googleUser.sub || googleUser.id,
          name: googleUser.name,
          picture: googleUser.picture,
          locale: googleUser.locale,
        },
      },
    };
  }

  /**
   * Exchange authorization code for tokens (for server-side flow)
   * @param {string} code - Authorization code from Google
   * @param {string} redirectUri - Redirect URI used in the auth request
   * @returns {Object} Token response from Google
   */
  async exchangeCodeForTokens(code, redirectUri) {
    try {
      const { tokens } = await this.client.getToken({
        code,
        redirect_uri: redirectUri,
      });

      return tokens;
    } catch (error) {
      console.error('Failed to exchange code for tokens:', error.message);
      throw new Error('Failed to exchange authorization code');
    }
  }
}

module.exports = new GoogleService();