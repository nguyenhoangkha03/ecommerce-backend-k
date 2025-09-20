# BadmintonShop Backend API

Backend API cho website BadmintonShop - chuyên bán các sản phẩm cầu lông với tích hợp AI Chatbot thông minh, được xây dựng bằng Node.js, Express và Sequelize.

## 🚀 Tính năng chính

### 🛒 E-commerce Core
- Xác thực người dùng (đăng ký, đăng nhập, quên mật khẩu)
- Đăng nhập social với Facebook/Google
- Quản lý sản phẩm và danh mục cầu lông
- Giỏ hàng và thanh toán với Stripe
- Quản lý đơn hàng và tracking
- Đánh giá và phản hồi sản phẩm
- Danh sách yêu thích
- Quản lý địa chỉ giao hàng đa cấp

### 🤖 AI Chatbot với Google Gemini
- Tư vấn sản phẩm thông minh dựa trên nhu cầu
- Gợi ý sản phẩm phù hợp với ngân sách
- Phân tích preferences và lịch sử mua hàng
- Hỗ trợ khách hàng 24/7
- Anti-duplicate recommendations
- Context-aware conversations

### 👥 Quản lý người dùng nâng cao
- Phân quyền đa cấp (Admin/Manager/Customer)
- JWT Authentication + Refresh Token
- Rate limiting và security headers
- Audit logging cho admin actions
- Upload và crop avatar

### 📊 Analytics & Business Intelligence
- Dashboard analytics cho admin
- Cohort analysis khách hàng
- Customer Lifetime Value (LTV)
- Purchase frequency analytics
- Revenue và order tracking
- Advanced reporting với date filters

### 🛡️ Security & Performance
- Helmet.js security headers
- XSS protection và input sanitization
- Redis caching
- Image optimization với Sharp
- File upload validation
- Request rate limiting

## 📋 Yêu cầu hệ thống

- **Node.js**: v16+ 
- **PostgreSQL**: v12+
- **Redis**: v6+ (cho caching, tùy chọn)
- **npm**: v8+

## 🔑 API Keys cần thiết

- **Google Generative AI**: API key cho Gemini chatbot
- **Stripe**: Secret key cho payment processing
- **Facebook**: App credentials cho social login
- **Google OAuth**: Client credentials (optional)
- **SMTP**: Email credentials cho notifications

## Cài đặt

1. Clone repository:

```bash
git clone <repository-url>
cd backend
```

2. Cài đặt các dependencies:

```bash
npm install
```

3. Tạo file .env từ file .env.example và cấu hình các biến môi trường:

```bash
cp .env.example .env
```

4. Tạo database và chạy migrations:

```bash
npm run db:migrate
```

5. (Tùy chọn) Chạy seeders để tạo dữ liệu mẫu:

```bash
npm run db:seed
```

## Chạy ứng dụng

### Development mode:

```bash
npm run dev
```

### Production mode:

```bash
npm start
```

## API Endpoints

### Auth

- `POST /api/auth/register` - Đăng ký tài khoản
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/verify-email/:token` - Xác thực email
- `POST /api/auth/refresh-token` - Làm mới token
- `POST /api/auth/forgot-password` - Quên mật khẩu
- `POST /api/auth/reset-password` - Đặt lại mật khẩu
- `GET /api/auth/me` - Lấy thông tin người dùng hiện tại

### Users

- `PUT /api/users/profile` - Cập nhật thông tin cá nhân
- `POST /api/users/change-password` - Đổi mật khẩu
- `GET /api/users/addresses` - Lấy danh sách địa chỉ
- `POST /api/users/addresses` - Thêm địa chỉ mới
- `PUT /api/users/addresses/:id` - Cập nhật địa chỉ
- `DELETE /api/users/addresses/:id` - Xóa địa chỉ
- `PATCH /api/users/addresses/:id/default` - Đặt địa chỉ mặc định

### Categories

- `GET /api/categories` - Lấy tất cả danh mục
- `GET /api/categories/tree` - Lấy cây danh mục
- `GET /api/categories/:id` - Lấy danh mục theo ID
- `GET /api/categories/slug/:slug` - Lấy danh mục theo slug
- `GET /api/categories/:id/products` - Lấy sản phẩm theo danh mục
- `POST /api/categories` - Tạo danh mục mới (Admin)
- `PUT /api/categories/:id` - Cập nhật danh mục (Admin)
- `DELETE /api/categories/:id` - Xóa danh mục (Admin)

### Products

- `GET /api/products` - Lấy tất cả sản phẩm
- `GET /api/products/featured` - Lấy sản phẩm nổi bật
- `GET /api/products/search` - Tìm kiếm sản phẩm
- `GET /api/products/:id` - Lấy sản phẩm theo ID
- `GET /api/products/slug/:slug` - Lấy sản phẩm theo slug
- `GET /api/products/:id/related` - Lấy sản phẩm liên quan
- `POST /api/products` - Tạo sản phẩm mới (Admin)
- `PUT /api/products/:id` - Cập nhật sản phẩm (Admin)
- `DELETE /api/products/:id` - Xóa sản phẩm (Admin)

### Cart

- `GET /api/cart` - Lấy giỏ hàng
- `POST /api/cart` - Thêm sản phẩm vào giỏ hàng
- `PUT /api/cart/items/:id` - Cập nhật số lượng sản phẩm
- `DELETE /api/cart/items/:id` - Xóa sản phẩm khỏi giỏ hàng
- `DELETE /api/cart` - Xóa tất cả sản phẩm trong giỏ hàng

### Orders

- `POST /api/orders` - Tạo đơn hàng mới
- `GET /api/orders` - Lấy danh sách đơn hàng của người dùng
- `GET /api/orders/:id` - Lấy chi tiết đơn hàng theo ID
- `GET /api/orders/number/:number` - Lấy chi tiết đơn hàng theo số đơn hàng
- `POST /api/orders/:id/cancel` - Hủy đơn hàng
- `GET /api/orders/admin/all` - Lấy tất cả đơn hàng (Admin)
- `PATCH /api/orders/admin/:id/status` - Cập nhật trạng thái đơn hàng (Admin)

### Reviews

- `GET /api/reviews/product/:productId` - Lấy đánh giá của sản phẩm
- `GET /api/reviews/user` - Lấy đánh giá của người dùng
- `POST /api/reviews` - Tạo đánh giá mới
- `PUT /api/reviews/:id` - Cập nhật đánh giá
- `DELETE /api/reviews/:id` - Xóa đánh giá
- `GET /api/reviews/admin/all` - Lấy tất cả đánh giá (Admin)
- `PATCH /api/reviews/admin/:id/verify` - Xác minh đánh giá (Admin)

### Wishlist

- `GET /api/wishlist` - Lấy danh sách yêu thích
- `POST /api/wishlist` - Thêm sản phẩm vào danh sách yêu thích
- `DELETE /api/wishlist/:productId` - Xóa sản phẩm khỏi danh sách yêu thích
- `GET /api/wishlist/check/:productId` - Kiểm tra sản phẩm có trong danh sách yêu thích
- `DELETE /api/wishlist` - Xóa tất cả sản phẩm trong danh sách yêu thích

### 🤖 AI Chatbot

- `POST /api/chatbot/chat` - Gửi tin nhắn đến AI chatbot
- `GET /api/chatbot/recommendations` - Lấy gợi ý sản phẩm từ AI
- `POST /api/chatbot/feedback` - Gửi feedback về chatbot response
- `GET /api/chatbot/history` - Lấy lịch sử chat của user
- `DELETE /api/chatbot/history` - Xóa lịch sử chat

### 📊 Analytics (Admin/Manager)

- `GET /api/analytics/dashboard` - Dashboard tổng quan
- `GET /api/analytics/revenue` - Thống kê doanh thu theo thời gian
- `GET /api/analytics/orders` - Phân tích đơn hàng
- `GET /api/analytics/customers` - Thống kê khách hàng
- `GET /api/analytics/products` - Phân tích sản phẩm bán chạy
- `GET /api/analytics/cohort` - Cohort analysis
- `GET /api/analytics/ltv` - Customer Lifetime Value
- `GET /api/analytics/frequency` - Purchase frequency analysis

### 👨‍💼 Admin Management

- `GET /api/admin/users` - Quản lý danh sách users
- `PATCH /api/admin/users/:id/role` - Thay đổi role user
- `PATCH /api/admin/users/:id/status` - Khóa/mở khóa user
- `GET /api/admin/audit-logs` - Xem audit logs
- `GET /api/admin/system-stats` - Thống kê hệ thống

### 📤 File Upload

- `POST /api/upload/avatar` - Upload avatar người dùng
- `POST /api/upload/product-images` - Upload hình ảnh sản phẩm
- `DELETE /api/upload/image/:filename` - Xóa hình ảnh

### 🔄 Social Authentication

- `POST /api/auth/facebook` - Đăng nhập Facebook
- `POST /api/auth/google` - Đăng nhập Google
- `GET /api/auth/facebook/callback` - Facebook callback
- `GET /api/auth/google/callback` - Google callback

## 📁 Cấu trúc thư mục

```
src/
├── config/                  # Cấu hình ứng dụng
│   ├── database.js          # Config PostgreSQL
│   ├── redis.js             # Config Redis cache
│   └── swagger.js           # API documentation
├── constants/               # Các hằng số
│   ├── orderStatus.js       # Trạng thái đơn hàng
│   ├── permissions.js       # Quyền hạn
│   └── roles.js             # Vai trò người dùng
├── controllers/             # Controllers xử lý request
│   ├── authController.js    # Authentication
│   ├── chatbotController.js # AI Chatbot
│   ├── analyticsController.js # Business analytics
│   ├── adminController.js   # Admin management
│   └── ...
├── middlewares/             # Middleware functions
│   ├── auth.js              # JWT authentication
│   ├── permissions.js       # Role-based access control
│   ├── validation.js        # Input validation
│   ├── rateLimit.js         # Rate limiting
│   └── security.js          # Security headers
├── models/                  # Sequelize models
│   ├── User.js              # User model
│   ├── Product.js           # Product model
│   ├── Order.js             # Order model
│   ├── ChatHistory.js       # Chat history
│   └── ...
├── routes/                  # API routes
│   ├── auth.routes.js       # Authentication routes
│   ├── chatbot.routes.js    # Chatbot routes
│   ├── analytics.routes.js  # Analytics routes
│   └── ...
├── services/                # Business logic services
│   ├── geminiChatbot.service.js # AI chatbot service
│   ├── chatbot.service.js   # Chatbot core logic
│   ├── email/               # Email services
│   ├── payment/             # Stripe integration
│   ├── imageService.js      # Image processing
│   ├── facebookService.js   # Facebook integration
│   └── ...
├── utils/                   # Helper utilities
│   ├── badmintonRecommendationHelpers.js # AI recommendations
│   ├── imageUtils.js        # Image processing helpers
│   ├── validation.js        # Custom validations
│   └── ...
├── validators/              # Request validation schemas
│   ├── auth.validator.js    # Auth validation
│   ├── order.validator.js   # Order validation
│   └── ...
├── migrations/              # Database migrations
├── seeders/                 # Sample data seeders
├── app.js                   # Express application setup
└── server.js                # Application entry point
```

## 🧪 Testing

```bash
# Chạy tất cả tests
npm test

# Chạy tests với coverage
npm run test:coverage

# Chạy tests trong watch mode
npm run test:watch

# Test specific file
npm test -- --testPathPattern=controllers
```

## 📊 Database Scripts

```bash
# Tạo migration mới
npx sequelize-cli migration:generate --name migration-name

# Chạy migrations
npm run db:migrate

# Rollback migration
npx sequelize-cli db:migrate:undo

# Tạo seeder
npx sequelize-cli seed:generate --name seeder-name

# Chạy all seeders
npm run db:seed

# Reset database (drop + create + migrate + seed)
npm run db:reset
```

## 🚀 Production Deployment

### Environment Setup
```bash
# Set production environment
export NODE_ENV=production

# Install production dependencies only
npm ci --only=production

# Run production server
npm start
```

### Docker Deployment
```bash
# Build Docker image
docker build -t badmintonshop-api .

# Run container
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=your_db_host \
  -e DB_NAME=your_db_name \
  badmintonshop-api
```

### Performance Monitoring

- **Logs**: Winston logging với rotation
- **Health Check**: `GET /api/health`
- **Metrics**: Endpoint `/api/metrics` cho monitoring tools
- **Error Tracking**: Structured error logging

## 🔧 Development Tools

```bash
# Linting
npm run lint
npm run lint:fix

# Code formatting với Prettier
npm run format

# Nodemon development server
npm run dev

# Debug mode
npm run debug
```

## 🛡️ Security Features

- **Helmet.js**: Security headers
- **Rate Limiting**: Protection against brute force
- **Input Sanitization**: XSS protection
- **CORS**: Configurable cross-origin requests
- **JWT**: Secure authentication với refresh tokens
- **File Upload**: Validated and sanitized uploads
- **SQL Injection**: Sequelize ORM protection

## 🤖 AI Chatbot Features

### Gemini Integration
- Context-aware conversations
- Product recommendation based on user preferences
- Budget-conscious suggestions
- Anti-duplicate recommendation system
- Purchase history analysis

### Recommendation Engine
- Smart product matching
- Category-based filtering
- Price range optimization
- Seasonal recommendations
- User behavior analysis

## 📈 Analytics Capabilities

- **Revenue Tracking**: Daily, weekly, monthly reports
- **Customer Analytics**: LTV, cohort analysis, retention
- **Product Performance**: Best sellers, trend analysis
- **Order Analytics**: Status tracking, fulfillment metrics
- **User Behavior**: Page views, conversion rates

## 🔗 External Integrations

- **Stripe**: Payment processing và webhooks
- **Google Gemini**: AI chatbot capabilities
- **Facebook Login**: Social authentication
- **Email Service**: SMTP với template support
- **Image CDN**: Optimized image delivery

## 📝 License

ISC License - Open source educational project

## 🆘 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL service
   sudo systemctl status postgresql
   # Verify connection string in .env
   ```

2. **Redis Connection Error**
   ```bash
   # Install và start Redis
   sudo apt install redis-server
   sudo systemctl start redis
   ```

3. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   ```

4. **Migration Errors**
   ```bash
   # Reset database nếu development
   npm run db:reset
   ```

### Debug Mode
```bash
# Enable debug logging
DEBUG=app:* npm run dev

# Database query logging
DEBUG=sequelize:sql npm run dev
```

For more issues, check the [GitHub Issues](https://github.com/your-repo/issues) page.
