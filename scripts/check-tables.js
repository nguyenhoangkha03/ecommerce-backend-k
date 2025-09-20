#!/usr/bin/env node

const sequelize = require('../src/config/sequelize');

async function checkTables() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Connected successfully.');

    // Get all table names
    const [results] = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log(`\n📊 Found ${results.length} tables in database:\n`);
    results.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.table_name}`);
    });

    // Count records in each table
    console.log('\n📈 Record counts:');
    for (const row of results) {
      try {
        const [[count]] = await sequelize.query(
          `SELECT COUNT(*) as count FROM "${row.table_name}"`
        );
        console.log(`   ${row.table_name}: ${count.count} records`);
      } catch (error) {
        console.log(`   ${row.table_name}: Error counting`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
    console.log('\n🔒 Database connection closed.');
  }
}

if (require.main === module) {
  checkTables();
}

module.exports = checkTables;