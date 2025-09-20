// Simple location data seeding without complex migration
const locationData = [
  // Provinces
  { id: 1, name: 'Hà Nội', type: 'province', code: 'HN', parent_id: null },
  { id: 2, name: 'Hồ Chí Minh', type: 'province', code: 'HCM', parent_id: null },
  { id: 3, name: 'Đà Nẵng', type: 'province', code: 'DN', parent_id: null },
  { id: 4, name: 'Hải Phòng', type: 'province', code: 'HP', parent_id: null },
  { id: 5, name: 'Cần Thơ', type: 'province', code: 'CT', parent_id: null },
  
  // Districts for Hà Nội (id: 1)
  { id: 11, name: 'Quận Ba Đình', type: 'district', code: 'BD', parent_id: 1 },
  { id: 12, name: 'Quận Hoàn Kiếm', type: 'district', code: 'HK', parent_id: 1 },
  { id: 13, name: 'Quận Đống Đa', type: 'district', code: 'DD', parent_id: 1 },
  { id: 14, name: 'Quận Cầu Giấy', type: 'district', code: 'CG', parent_id: 1 },
  { id: 15, name: 'Quận Thanh Xuân', type: 'district', code: 'TX', parent_id: 1 },
  
  // Districts for Hồ Chí Minh (id: 2)
  { id: 21, name: 'Quận 1', type: 'district', code: 'Q1', parent_id: 2 },
  { id: 22, name: 'Quận 2', type: 'district', code: 'Q2', parent_id: 2 },
  { id: 23, name: 'Quận 3', type: 'district', code: 'Q3', parent_id: 2 },
  { id: 24, name: 'Quận 7', type: 'district', code: 'Q7', parent_id: 2 },
  { id: 25, name: 'Quận Bình Thạnh', type: 'district', code: 'BT', parent_id: 2 },
  
  // Districts for Đà Nẵng (id: 3)
  { id: 31, name: 'Quận Hải Châu', type: 'district', code: 'HC', parent_id: 3 },
  { id: 32, name: 'Quận Thanh Khê', type: 'district', code: 'TK', parent_id: 3 },
  { id: 33, name: 'Quận Liên Chiểu', type: 'district', code: 'LC', parent_id: 3 },
  
  // Wards for Quận Ba Đình (id: 11)
  { id: 111, name: 'Phường Phúc Xá', type: 'ward', code: 'PX', parent_id: 11 },
  { id: 112, name: 'Phường Trúc Bạch', type: 'ward', code: 'TB', parent_id: 11 },
  { id: 113, name: 'Phường Vĩnh Phúc', type: 'ward', code: 'VP', parent_id: 11 },
  { id: 114, name: 'Phường Cống Vị', type: 'ward', code: 'CV', parent_id: 11 },
  
  // Wards for Quận Hoàn Kiếm (id: 12)
  { id: 121, name: 'Phường Phan Chu Trinh', type: 'ward', code: 'PCT', parent_id: 12 },
  { id: 122, name: 'Phường Tràng Tiền', type: 'ward', code: 'TT', parent_id: 12 },
  { id: 123, name: 'Phường Hàng Bông', type: 'ward', code: 'HB', parent_id: 12 },
  { id: 124, name: 'Phường Hàng Gai', type: 'ward', code: 'HG', parent_id: 12 },
  
  // Wards for Quận 1 (id: 21)
  { id: 211, name: 'Phường Bến Nghé', type: 'ward', code: 'BN', parent_id: 21 },
  { id: 212, name: 'Phường Bến Thành', type: 'ward', code: 'BT', parent_id: 21 },
  { id: 213, name: 'Phường Nguyễn Thái Bình', type: 'ward', code: 'NTB', parent_id: 21 },
  { id: 214, name: 'Phường Phạm Ngũ Lão', type: 'ward', code: 'PNL', parent_id: 21 },
  
  // Wards for Quận 2 (id: 22)
  { id: 221, name: 'Phường Thảo Điền', type: 'ward', code: 'TD', parent_id: 22 },
  { id: 222, name: 'Phường An Phú', type: 'ward', code: 'AP', parent_id: 22 },
  { id: 223, name: 'Phường Bình An', type: 'ward', code: 'BA', parent_id: 22 },
  { id: 224, name: 'Phường Cát Lái', type: 'ward', code: 'CL', parent_id: 22 },
];

// Export as JSON cho frontend test
console.log('Vietnamese Location Data:');
console.log(JSON.stringify(locationData, null, 2));

console.log('\n=== API Test Data ===');
console.log('Provinces:', locationData.filter(l => l.type === 'province').length);
console.log('Districts:', locationData.filter(l => l.type === 'district').length);
console.log('Wards:', locationData.filter(l => l.type === 'ward').length);

module.exports = locationData;