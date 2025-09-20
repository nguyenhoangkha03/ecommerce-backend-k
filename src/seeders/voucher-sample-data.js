const { Voucher } = require('../models');

const sampleVouchers = [
  {
    code: 'FREESHIP50',
    name: 'Miễn phí vận chuyển',
    description: 'Miễn phí vận chuyển cho đơn hàng từ 500,000đ',
    type: 'free_shipping',
    value: 50000,
    minOrderValue: 500000,
    maxDiscount: 50000,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    isActive: true,
    usageLimit: 100,
    usedCount: 0,
    userLimit: 'all',
  },
  {
    code: 'DISCOUNT10',
    name: 'Giảm 10%',
    description: 'Giảm 10% cho đơn hàng từ 1,000,000đ, tối đa 100,000đ',
    type: 'percentage',
    value: 10,
    minOrderValue: 1000000,
    maxDiscount: 100000,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
    usageLimit: 50,
    usedCount: 0,
    userLimit: 'all',
  },
  {
    code: 'SAVE50K',
    name: 'Giảm 50,000đ',
    description: 'Giảm 50,000đ cho đơn hàng từ 800,000đ',
    type: 'fixed_amount',
    value: 50000,
    minOrderValue: 800000,
    maxDiscount: null,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
    usageLimit: 200,
    usedCount: 0,
    userLimit: 'all',
  },
  {
    code: 'NEWBIE20',
    name: 'Khách hàng mới giảm 20%',
    description: 'Giảm 20% cho khách hàng mới, tối đa 150,000đ',
    type: 'percentage',
    value: 20,
    minOrderValue: 300000,
    maxDiscount: 150000,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
    usageLimit: null, // Unlimited
    usedCount: 0,
    userLimit: 'first_time',
  },
  {
    code: 'WEEKEND15',
    name: 'Cuối tuần giảm 15%',
    description: 'Giảm 15% cho đơn hàng cuối tuần, tối đa 80,000đ',
    type: 'percentage',
    value: 15,
    minOrderValue: 600000,
    maxDiscount: 80000,
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    isActive: true,
    usageLimit: 30,
    usedCount: 0,
    userLimit: 'all',
  },
  {
    code: 'BIGORDER100',
    name: 'Đơn lớn giảm 100K',
    description: 'Giảm 100,000đ cho đơn hàng từ 2,000,000đ',
    type: 'fixed_amount',
    value: 100000,
    minOrderValue: 2000000,
    maxDiscount: null,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
    usageLimit: 25,
    usedCount: 0,
    userLimit: 'all',
  },
];

const createSampleVouchers = async () => {
  try {
    console.log('🎫 Creating sample vouchers...');
    
    for (const voucherData of sampleVouchers) {
      const [voucher, created] = await Voucher.findOrCreate({
        where: { code: voucherData.code },
        defaults: voucherData,
      });
      
      if (created) {
        console.log(`✅ Created voucher: ${voucher.code} - ${voucher.name}`);
      } else {
        console.log(`⚠️  Voucher already exists: ${voucher.code}`);
      }
    }
    
    console.log('🎉 Sample vouchers created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating sample vouchers:', error);
    throw error;
  }
};

module.exports = {
  sampleVouchers,
  createSampleVouchers,
};

// Run directly if this file is executed
if (require.main === module) {
  createSampleVouchers()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}