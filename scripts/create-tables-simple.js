#!/usr/bin/env node

const sequelize = require('../src/config/sequelize');

async function createTables() {
  try {
    console.log('🔄 Connecting to PostgreSQL database...');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    console.log('🔄 Dropping existing tables (if any)...');

    // Drop all tables with CASCADE to handle foreign key dependencies
    await sequelize.query('DROP SCHEMA public CASCADE');
    await sequelize.query('CREATE SCHEMA public');
    console.log('✅ Schema reset completed.');

    console.log('🔄 Loading all models...');

    // Import all models to ensure they're registered with Sequelize
    const models = require('../src/models');
    console.log(`✅ Loaded ${Object.keys(models).length} models`);

    console.log('🔄 Creating tables using Sequelize sync...');

    // Use Sequelize's built-in sync to create all tables
    await sequelize.sync({ force: true });

    console.log('✅ All tables created successfully!');

    // Create UUID extension if needed
    console.log('📦 Creating UUID extension...');
    try {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('✅ UUID extension ready.');
    } catch (error) {
      console.log('⚠️  UUID extension might already exist.');
    }

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    console.error('Details:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('🔒 Database connection closed.');
  }
}

// Run if called directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('🎉 Database setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to create tables:', error);
      process.exit(1);
    });
}

module.exports = createTables;