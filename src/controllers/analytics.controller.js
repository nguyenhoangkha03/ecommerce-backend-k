const { catchAsync } = require('../utils/catchAsync');
const { AppError } = require('../middlewares/errorHandler');
const { User, Order } = require('../models');
const { Op, Sequelize } = require('sequelize');

/**
 * Test endpoint để kiểm tra analytics permission
 */
const testAnalyticsPermission = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '🎉 Analytics permission working! User có quyền truy cập analytics.',
    data: {
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      timestamp: new Date().toISOString(),
      permissions: {
        'analytics:read': '✅ GRANTED',
      }
    }
  });
});

/**
 * Get basic analytics overview
 * Tái sử dụng logic từ admin dashboard
 */
const getBasicAnalytics = catchAsync(async (req, res) => {
  const {
    User,
    Product,
    Order,
    OrderItem,
  } = require('../models');
  const { Op, Sequelize } = require('sequelize');

  try {
    // Thống kê tổng quan (tái sử dụng từ admin dashboard)
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const totalUsers = await User.count({ where: { role: 'customer' } });
    const totalProducts = await Product.count();
    const totalOrders = await Order.count();
    const totalRevenue = await Order.sum('total', {
      where: { status: 'delivered' },
    });

    // Thống kê tháng này
    const monthlyOrders = await Order.count({
      where: { created_at: { [Op.gte]: startOfMonth } },
    });

    const monthlyRevenue = await Order.sum('total', {
      where: {
        status: 'delivered',
        created_at: { [Op.gte]: startOfMonth },
      },
    });

    // Top 5 sản phẩm bán chạy
    const topProducts = await OrderItem.findAll({
      attributes: [
        'productId',
        [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalSold'],
        [Sequelize.fn('SUM', Sequelize.literal('quantity * "OrderItem"."price"')), 'totalRevenue'],
      ],
      include: [
        {
          model: Product,
          attributes: ['name', 'images', 'price'],
        },
      ],
      group: ['productId', 'Product.id'],
      order: [[Sequelize.fn('SUM', Sequelize.col('quantity')), 'DESC']],
      limit: 5,
    });

    res.status(200).json({
      status: 'success',
      message: 'Basic analytics data retrieved successfully',
      data: {
        overview: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalRevenue: totalRevenue || 0,
        },
        monthly: {
          orders: monthlyOrders,
          revenue: monthlyRevenue || 0,
        },
        topProducts: topProducts.map((item) => ({
          product: item.Product,
          totalSold: parseInt(item.getDataValue('totalSold')),
          totalRevenue: parseFloat(item.getDataValue('totalRevenue')),
        })),
        timestamp: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('Error in getBasicAnalytics:', error);
    throw new AppError('Lỗi khi lấy dữ liệu thống kê cơ bản', 500);
  }
});

/**
 * Get chart data for last 30 days (revenue & orders)
 */
const getChartData = catchAsync(async (req, res) => {
  const { Order } = require('../models');
  const { Op, Sequelize } = require('sequelize');

  try {
    // Get date range from query params or default to last 30 days
    console.log('🔍 Query params:', req.query);
    let startDate, endDate;
    
    if (req.query.startDate && req.query.endDate) {
      console.log('📅 Using custom date range from params');
      startDate = new Date(req.query.startDate);
      endDate = new Date(req.query.endDate);
      
      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new AppError('Invalid date format. Please use YYYY-MM-DD', 400);
      }
      
      // Ensure startDate is before endDate
      if (startDate > endDate) {
        throw new AppError('Start date must be before end date', 400);
      }
      
      // Limit to max 365 days
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        throw new AppError('Date range cannot exceed 365 days', 400);
      }
    } else {
      // Default to last 30 days
      console.log('📅 Using default date range (last 30 days)');
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    }
    
    console.log('📅 Chart data query - Date range:', { startDate, endDate });

    console.log('🔍 Starting database query...');
    // Lấy dữ liệu doanh thu và đơn hàng theo ngày
    const dailyStats = await Order.findAll({
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'orderCount'],
        [
          Sequelize.fn('SUM', 
            Sequelize.literal(`CASE WHEN status = 'delivered' THEN "total" ELSE 0 END`)
          ), 
          'revenue'
        ],
        [
          Sequelize.fn('COUNT',
            Sequelize.literal(`CASE WHEN status = 'delivered' THEN 1 ELSE NULL END`)
          ),
          'deliveredOrders'
        ]
      ],
      where: {
        created_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      group: [Sequelize.fn('DATE', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('DATE', Sequelize.col('created_at')), 'ASC']],
      raw: true
    });
    
    console.log('✅ Database query completed!', dailyStats.length, 'records');

    // Generate complete date range (fill missing dates with 0)
    const chartData = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = dailyStats.find(item => item.date === dateStr);
      
      chartData.push({
        date: dateStr,
        dateFormatted: currentDate.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit'
        }),
        orderCount: dayData ? parseInt(dayData.orderCount) : 0,
        revenue: dayData ? parseFloat(dayData.revenue) || 0 : 0,
        deliveredOrders: dayData ? parseInt(dayData.deliveredOrders) : 0
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.status(200).json({
      status: 'success',
      message: 'Chart data retrieved successfully',
      data: {
        chartData,
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          days: chartData.length
        },
        summary: {
          totalOrders: chartData.reduce((sum, day) => sum + day.orderCount, 0),
          totalRevenue: chartData.reduce((sum, day) => sum + day.revenue, 0),
          totalDeliveredOrders: chartData.reduce((sum, day) => sum + day.deliveredOrders, 0),
          avgDailyOrders: (chartData.reduce((sum, day) => sum + day.orderCount, 0) / chartData.length).toFixed(1),
          avgDailyRevenue: (chartData.reduce((sum, day) => sum + day.revenue, 0) / chartData.length).toFixed(0)
        },
        timestamp: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('Error in getChartData:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new AppError(`Lỗi khi lấy dữ liệu biểu đồ: ${error.message}`, 500);
  }
});

/**
 * Test advanced analytics (cần quyền analytics:advanced)
 */
const getAdvancedAnalytics = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '🔥 Advanced analytics access granted!',
    data: {
      userId: req.user.id,
      userEmail: req.user.email,
      advanced_features: [
        'Customer Lifetime Value',
        'Cohort Analysis', 
        'Revenue Forecasting',
        'Advanced Segmentation'
      ],
      note: 'Advanced analytics features sẽ được implement ở Phase 4',
      timestamp: new Date().toISOString(),
    }
  });
});

/**
 * Get enhanced chart data (bar, pie, area charts)
 */
const getEnhancedChartData = catchAsync(async (req, res) => {
  const { Order } = require('../models');
  const { Op, Sequelize } = require('sequelize');

  try {
    console.log('🔍 Enhanced chart data query - params:', req.query);
    
    // Get date range from query params or default to last 30 days
    let startDate, endDate;
    
    if (req.query.startDate && req.query.endDate) {
      startDate = new Date(req.query.startDate);
      endDate = new Date(req.query.endDate);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new AppError('Invalid date format. Please use YYYY-MM-DD', 400);
      }
    } else {
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 90); // 3 months for better monthly view
    }

    // 1. Monthly Revenue Bar Chart Data
    const monthlyStats = await Order.findAll({
      attributes: [
        [Sequelize.fn('DATE_TRUNC', 'month', Sequelize.col('created_at')), 'month'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'orderCount'],
        [Sequelize.fn('SUM', Sequelize.literal(`CASE WHEN status = 'delivered' THEN "total" ELSE 0 END`)), 'revenue']
      ],
      where: {
        created_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      group: [Sequelize.fn('DATE_TRUNC', 'month', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('DATE_TRUNC', 'month', Sequelize.col('created_at')), 'ASC']],
      raw: true
    });

    // 2. Order Status Pie Chart Data
    const statusStats = await Order.findAll({
      attributes: [
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('total')), 'totalValue']
      ],
      where: {
        created_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      group: ['status'],
      raw: true
    });

    // 3. Daily Activity Heatmap Data (last 30 days for better visualization)
    const heatmapStartDate = new Date();
    heatmapStartDate.setDate(heatmapStartDate.getDate() - 30);
    
    const heatmapStats = await Order.findAll({
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
        [Sequelize.fn('EXTRACT', Sequelize.literal('DOW FROM created_at')), 'dayOfWeek'], // 0=Sunday, 6=Saturday
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'activity']
      ],
      where: {
        created_at: {
          [Op.between]: [heatmapStartDate, endDate]
        }
      },
      group: [
        Sequelize.fn('DATE', Sequelize.col('created_at')),
        Sequelize.fn('EXTRACT', Sequelize.literal('DOW FROM created_at'))
      ],
      raw: true
    });

    // Format monthly data
    const monthlyChartData = monthlyStats.map(item => ({
      month: new Date(item.month).toLocaleDateString('vi-VN', { 
        year: 'numeric', 
        month: 'short' 
      }),
      monthKey: item.month,
      orderCount: parseInt(item.orderCount),
      revenue: parseFloat(item.revenue) || 0
    }));

    // Format status data
    const statusChartData = statusStats.map(item => ({
      status: item.status,
      count: parseInt(item.count),
      value: parseFloat(item.totalValue) || 0,
      percentage: 0 // Will calculate below
    }));

    // Calculate percentages for pie chart
    const totalOrders = statusChartData.reduce((sum, item) => sum + item.count, 0);
    statusChartData.forEach(item => {
      item.percentage = totalOrders > 0 ? ((item.count / totalOrders) * 100).toFixed(1) : 0;
    });

    // Format heatmap data
    const heatmapData = [];
    const weekDays = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    
    // Group by week and day
    const heatmapMap = new Map();
    heatmapStats.forEach(item => {
      const date = new Date(item.date);
      const weekNumber = Math.floor((date - heatmapStartDate) / (7 * 24 * 60 * 60 * 1000));
      const dayOfWeek = parseInt(item.dayOfWeek);
      const key = `${weekNumber}-${dayOfWeek}`;
      
      heatmapMap.set(key, {
        week: weekNumber,
        day: weekDays[dayOfWeek],
        dayIndex: dayOfWeek,
        activity: parseInt(item.activity),
        date: item.date
      });
    });

    // Convert to array
    for (let week = 0; week < 5; week++) {
      for (let day = 0; day < 7; day++) {
        const key = `${week}-${day}`;
        const data = heatmapMap.get(key) || {
          week,
          day: weekDays[day],
          dayIndex: day,
          activity: 0,
          date: null
        };
        heatmapData.push(data);
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Enhanced chart data retrieved successfully',
      data: {
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        monthlyChart: monthlyChartData,
        statusChart: statusChartData,
        heatmapChart: heatmapData,
        summary: {
          totalMonths: monthlyChartData.length,
          totalStatuses: statusChartData.length,
          heatmapDays: heatmapData.length
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in getEnhancedChartData:', error);
    throw new AppError(`Lỗi khi lấy dữ liệu biểu đồ nâng cao: ${error.message}`, 500);
  }
});

/**
 * Get Customer Analytics với Customer LTV
 * Phase 4.1: Customer Analytics và Lifetime Value
 */
const getCustomerAnalytics = catchAsync(async (req, res) => {
  const { User, Order, OrderItem, sequelize } = require('../models');
  const { Op, Sequelize } = require('sequelize');

  try {
    console.log('🔍 Getting Customer Analytics data...');

    // 1. Customer LTV Analysis
    const customerLTVData = await User.findAll({
      where: { role: 'customer' },
      attributes: [
        'id',
        'firstName',
        'email',
        'created_at',
        [
          Sequelize.literal(`(
            SELECT COALESCE(SUM("total"), 0) 
            FROM "orders" 
            WHERE "orders"."user_id" = "User"."id" 
            AND "orders"."status" = 'delivered'
          )`),
          'totalSpent'
        ],
        [
          Sequelize.literal(`(
            SELECT COUNT(*) 
            FROM "orders" 
            WHERE "orders"."user_id" = "User"."id"
          )`),
          'totalOrders'
        ],
        [
          Sequelize.literal(`(
            SELECT AVG("total") 
            FROM "orders" 
            WHERE "orders"."user_id" = "User"."id" 
            AND "orders"."status" = 'delivered'
          )`),
          'averageOrderValue'
        ]
      ],
      order: [[Sequelize.literal('"totalSpent"'), 'DESC']],
      limit: 20
    });

    // 2. Customer Segments based on LTV - using raw query to avoid GROUP BY aggregate issue
    const customerSegmentsRaw = await sequelize.query(`
      WITH customer_ltv AS (
        SELECT 
          u.id,
          COALESCE(SUM(o.total), 0) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'delivered'
        WHERE u.role = 'customer'
        GROUP BY u.id
      ),
      customer_segments AS (
        SELECT 
          CASE 
            WHEN total_spent >= 50000000 THEN 'VIP'
            WHEN total_spent >= 10000000 THEN 'Premium' 
            WHEN total_spent >= 1000000 THEN 'Regular'
            ELSE 'New'
          END as segment,
          COUNT(*) as customer_count,
          AVG(total_spent) as avg_ltv
        FROM customer_ltv
        GROUP BY 
          CASE 
            WHEN total_spent >= 50000000 THEN 'VIP'
            WHEN total_spent >= 10000000 THEN 'Premium'
            WHEN total_spent >= 1000000 THEN 'Regular'
            ELSE 'New'
          END
      )
      SELECT 
        segment,
        customer_count as "customerCount",
        avg_ltv as "avgLTV"
      FROM customer_segments
      ORDER BY avg_ltv DESC
    `, { 
      type: Sequelize.QueryTypes.SELECT 
    });

    const customerSegments = customerSegmentsRaw;

    // 3. New vs Returning Customers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newCustomers = await User.count({
      where: {
        role: 'customer',
        created_at: { [Op.gte]: thirtyDaysAgo }
      }
    });

    const returningCustomers = await Order.findAll({
      attributes: [
        'user_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'orderCount']
      ],
      where: {
        created_at: { [Op.gte]: thirtyDaysAgo }
      },
      group: ['user_id'],
      having: Sequelize.literal('COUNT(id) > 1')
    });

    // 4. Customer Purchase Frequency Analysis - using raw query
    const purchaseFrequencyRaw = await sequelize.query(`
      WITH customer_order_counts AS (
        SELECT 
          user_id,
          COUNT(*) as order_count
        FROM orders 
        WHERE status = 'delivered'
        GROUP BY user_id
      ),
      frequency_segments AS (
        SELECT 
          CASE 
            WHEN order_count >= 10 THEN 'Frequent (10+)'
            WHEN order_count >= 5 THEN 'Regular (5-9)'
            WHEN order_count >= 2 THEN 'Occasional (2-4)'
            ELSE 'One-time (1)'
          END as frequency,
          COUNT(*) as customer_count
        FROM customer_order_counts
        GROUP BY 
          CASE 
            WHEN order_count >= 10 THEN 'Frequent (10+)'
            WHEN order_count >= 5 THEN 'Regular (5-9)'
            WHEN order_count >= 2 THEN 'Occasional (2-4)'
            ELSE 'One-time (1)'
          END
      )
      SELECT 
        frequency,
        customer_count as "customerCount"
      FROM frequency_segments
      ORDER BY customer_count DESC
    `, { 
      type: Sequelize.QueryTypes.SELECT 
    });

    const purchaseFrequency = purchaseFrequencyRaw;

    // 5. Monthly Customer Growth
    const monthlyGrowth = await User.findAll({
      where: { role: 'customer' },
      attributes: [
        [Sequelize.fn('DATE_TRUNC', 'month', Sequelize.col('created_at')), 'month'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'newCustomers']
      ],
      group: [Sequelize.fn('DATE_TRUNC', 'month', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('DATE_TRUNC', 'month', Sequelize.col('created_at')), 'ASC']],
      limit: 12
    });

    res.status(200).json({
      status: 'success',
      message: 'Customer analytics data retrieved successfully',
      data: {
        customerLTV: customerLTVData.map(customer => ({
          id: customer.id,
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
          joinDate: customer.created_at,
          totalSpent: parseFloat(customer.getDataValue('totalSpent')) || 0,
          totalOrders: parseInt(customer.getDataValue('totalOrders')) || 0,
          averageOrderValue: parseFloat(customer.getDataValue('averageOrderValue')) || 0,
          ltv: parseFloat(customer.getDataValue('totalSpent')) || 0
        })),
        customerSegments: customerSegments.map(segment => ({
          segment: segment.segment,
          customerCount: parseInt(segment.customerCount),
          avgLTV: parseFloat(segment.avgLTV) || 0
        })),
        customerGrowth: {
          newCustomers: newCustomers,
          returningCustomers: returningCustomers.length,
          totalActive: newCustomers + returningCustomers.length
        },
        purchaseFrequency: purchaseFrequency.map(freq => ({
          frequency: freq.frequency,
          customerCount: parseInt(freq.customerCount)
        })),
        monthlyGrowth: monthlyGrowth.map(month => ({
          month: month.getDataValue('month'),
          newCustomers: parseInt(month.getDataValue('newCustomers'))
        })),
        summary: {
          totalCustomers: customerLTVData.length,
          totalSegments: customerSegments.length,
          analysisDate: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Error in getCustomerAnalytics:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      sql: error.sql || 'No SQL'
    });
    throw new AppError(`Lỗi khi lấy dữ liệu phân tích khách hàng: ${error.message}`, 500);
  }
});

/**
 * Get Cohort Analysis data (cần quyền analytics:advanced)
 * Phân tích nhóm khách hàng theo thời gian đăng ký và theo dõi retention
 */
const getCohortAnalysis = catchAsync(async (req, res) => {
  const { startDate, endDate, period = 'month' } = req.query;
  
  try {
    // Tính toán thời gian analysis (12 tháng gần nhất nếu không có filter)
    let analysisEndDate = new Date();
    let analysisStartDate = new Date();
    
    if (endDate) {
      analysisEndDate = new Date(endDate);
      if (isNaN(analysisEndDate.getTime())) {
        analysisEndDate = new Date();
      }
    }
    
    if (startDate) {
      analysisStartDate = new Date(startDate);
      if (isNaN(analysisStartDate.getTime())) {
        analysisStartDate = new Date(analysisEndDate.getFullYear() - 1, analysisEndDate.getMonth(), 1);
      }
    } else {
      // Sửa để lấy từ đầu năm hiện tại thay vì 12 tháng trước
      analysisStartDate = new Date(analysisEndDate.getFullYear(), 0, 1); // Từ đầu năm hiện tại
    }

    console.log(`🔍 Cohort Analysis: ${analysisStartDate.toISOString()} to ${analysisEndDate.toISOString()}`);

    // DEBUG: Kiểm tra tất cả customers trước
    const allCustomers = await User.findAll({
      where: { role: 'customer' },
      attributes: ['id', 'email', 'createdAt', 'created_at'],
      order: [['created_at', 'ASC']]
    });
    console.log('📊 All customers found:', allCustomers.length);
    allCustomers.forEach(u => {
      console.log(`   - ${u.email}: ${u.createdAt || u.created_at || u.dataValues.created_at}`);
    });

    // 1. Lấy tất cả users và first order date của họ
    const userFirstOrders = await User.findAll({
      where: {
        role: 'customer',
        created_at: {
          [Op.between]: [analysisStartDate, analysisEndDate]
        }
      },
      attributes: [
        'id',
        'firstName',
        'email',
        'createdAt',
        [
          Sequelize.literal(`(
            SELECT MIN("created_at") 
            FROM "orders" 
            WHERE "orders"."user_id" = "User"."id" 
            AND "orders"."status" = 'delivered'
          )`),
          'firstOrderDate'
        ]
      ],
      order: [['created_at', 'ASC']]
    });

    // 2. Tạo cohorts theo tháng đăng ký
    const cohorts = new Map();
    
    userFirstOrders.forEach(user => {
      const userCreatedAt = new Date(user.createdAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.warn('Invalid user created_at date:', user.createdAt);
        return;
      }
      const cohortMonth = new Date(userCreatedAt.getFullYear(), userCreatedAt.getMonth(), 1);
      // Sửa: dùng local date thay vì UTC để tránh lỗi timezone
      const cohortKey = `${userCreatedAt.getFullYear()}-${String(userCreatedAt.getMonth() + 1).padStart(2, '0')}`;
      
      console.log(`🔍 User ${user.email}:`);
      console.log(`   - createdAt: ${userCreatedAt}`);
      console.log(`   - cohortMonth: ${cohortMonth}`);
      console.log(`   - cohortKey: ${cohortKey}`);
      
      if (!cohorts.has(cohortKey)) {
        cohorts.set(cohortKey, {
          cohortMonth: cohortKey,
          cohortDate: cohortMonth,
          users: []
        });
      }
      
      cohorts.get(cohortKey).users.push({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        joinDate: user.createdAt,
        firstOrderDate: user.getDataValue('firstOrderDate')
      });
    });

    console.log('📊 Final cohorts created:');
    cohorts.forEach((cohortData, cohortKey) => {
      console.log(`   - ${cohortKey}: ${cohortData.users.length} users`);
    });

    // 3. Tính retention rates cho mỗi cohort
    const cohortAnalysisData = [];
    const periodsToAnalyze = 12; // Analyze 12 periods ahead
    
    for (const [cohortKey, cohortData] of cohorts) {
      const cohortUsers = cohortData.users;
      const cohortSize = cohortUsers.length;
      
      if (cohortSize === 0) continue;
      
      const retentionData = [cohortSize]; // Period 0 = 100% retention (all users who joined)
      
      // Tính retention cho từng period sau đó
      for (let period = 1; period <= periodsToAnalyze; period++) {
        const periodStartDate = new Date(cohortData.cohortDate);
        if (isNaN(periodStartDate.getTime())) {
          console.warn('Invalid cohort date:', cohortData.cohortDate);
          retentionData.push(0);
          continue;
        }
        periodStartDate.setMonth(periodStartDate.getMonth() + period);
        const periodEndDate = new Date(periodStartDate);
        periodEndDate.setMonth(periodEndDate.getMonth() + 1);
        
        // Đếm users active trong period này
        const activeUsersInPeriod = await Order.count({
          where: {
            user_id: {
              [Op.in]: cohortUsers.map(u => u.id)
            },
            created_at: {
              [Op.between]: [periodStartDate, periodEndDate]
            },
            status: 'delivered'
          },
          distinct: true,
          col: 'user_id'
        });
        
        retentionData.push(activeUsersInPeriod);
      }
      
      // Tính retention percentages
      const retentionPercentages = retentionData.map(count => 
        cohortSize > 0 ? ((count / cohortSize) * 100).toFixed(1) : '0.0'
      );
      
      cohortAnalysisData.push({
        cohort: cohortKey,
        cohortDate: cohortData.cohortDate,
        cohortSize: cohortSize,
        retentionCounts: retentionData,
        retentionPercentages: retentionPercentages,
        users: cohortUsers
      });
    }

    // 4. Tính overall retention metrics
    const overallMetrics = {
      totalCohorts: cohortAnalysisData.length,
      totalUsers: cohortAnalysisData.reduce((sum, cohort) => sum + cohort.cohortSize, 0),
      avgRetentionMonth1: 0,
      avgRetentionMonth3: 0,
      avgRetentionMonth6: 0,
      avgRetentionMonth12: 0
    };

    if (cohortAnalysisData.length > 0) {
      const validCohorts = cohortAnalysisData.filter(c => c.retentionPercentages.length > 1);
      
      if (validCohorts.length > 0) {
        overallMetrics.avgRetentionMonth1 = (validCohorts.reduce((sum, cohort) => 
          sum + parseFloat(cohort.retentionPercentages[1] || 0), 0) / validCohorts.length).toFixed(1);
      }
      
      const cohortsWith3Months = cohortAnalysisData.filter(c => c.retentionPercentages.length > 3);
      if (cohortsWith3Months.length > 0) {
        overallMetrics.avgRetentionMonth3 = (cohortsWith3Months.reduce((sum, cohort) => 
          sum + parseFloat(cohort.retentionPercentages[3] || 0), 0) / cohortsWith3Months.length).toFixed(1);
      }
      
      const cohortsWith6Months = cohortAnalysisData.filter(c => c.retentionPercentages.length > 6);
      if (cohortsWith6Months.length > 0) {
        overallMetrics.avgRetentionMonth6 = (cohortsWith6Months.reduce((sum, cohort) => 
          sum + parseFloat(cohort.retentionPercentages[6] || 0), 0) / cohortsWith6Months.length).toFixed(1);
      }
      
      const cohortsWith12Months = cohortAnalysisData.filter(c => c.retentionPercentages.length > 12);
      if (cohortsWith12Months.length > 0) {
        overallMetrics.avgRetentionMonth12 = (cohortsWith12Months.reduce((sum, cohort) => 
          sum + parseFloat(cohort.retentionPercentages[12] || 0), 0) / cohortsWith12Months.length).toFixed(1);
      }
    }

    // 5. Prepare heatmap data cho visualization
    const heatmapData = [];
    cohortAnalysisData.forEach((cohort, cohortIndex) => {
      cohort.retentionPercentages.forEach((percentage, periodIndex) => {
        heatmapData.push({
          cohort: cohort.cohort,
          period: periodIndex,
          value: parseFloat(percentage),
          displayValue: `${percentage}%`,
          users: periodIndex === 0 ? cohort.cohortSize : cohort.retentionCounts[periodIndex]
        });
      });
    });

    res.status(200).json({
      status: 'success',
      message: 'Cohort analysis data retrieved successfully',
      data: {
        cohorts: cohortAnalysisData,
        overallMetrics,
        heatmapData,
        analysisConfig: {
          startDate: analysisStartDate.toISOString(),
          endDate: analysisEndDate.toISOString(),
          period: period,
          periodsAnalyzed: periodsToAnalyze
        },
        summary: {
          totalCohorts: overallMetrics.totalCohorts,
          totalUsersAnalyzed: overallMetrics.totalUsers,
          analysisDate: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Error in getCohortAnalysis:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      sql: error.sql || 'No SQL'
    });
    throw new AppError(`Lỗi khi phân tích cohort: ${error.message}`, 500);
  }
});

/**
 * Test export functionality (cần quyền analytics:export)
 */
const testExportAnalytics = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '📊 Export analytics access granted!',
    data: {
      userId: req.user.id,
      userEmail: req.user.email,
      export_formats: ['Excel', 'CSV', 'PDF'],
      note: 'Export functionality sẽ được implement ở Phase 4',
      timestamp: new Date().toISOString(),
    }
  });
});

module.exports = {
  testAnalyticsPermission,
  getBasicAnalytics,
  getChartData, // ✅ THÊM CHART DATA EXPORT
  getEnhancedChartData, // ✅ THÊM ENHANCED CHART DATA
  getCustomerAnalytics, // ✅ THÊM CUSTOMER ANALYTICS & LTV
  getCohortAnalysis, // ✅ THÊM COHORT ANALYSIS
  getAdvancedAnalytics,
  testExportAnalytics,
};