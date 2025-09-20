#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/sequelize');

async function createTables() {
  try {
    console.log('🔄 Connecting to PostgreSQL database...');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Read SQL file
    const sqlFilePath = path.join(__dirname, '..', 'create_tables.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('🔄 Creating tables...');

    // Split SQL content by semicolon and execute each statement
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await sequelize.query(statement);
        } catch (error) {
          // Log warning for non-critical errors (like extension already exists)
          if (error.message.includes('already exists')) {
            console.log(`⚠️  ${error.message}`);
          } else {
            console.error(`❌ Error executing statement: ${statement.substring(0, 100)}...`);
            console.error(`   Error: ${error.message}`);
          }
        }
      }
    }

    console.log('✅ All tables created successfully!');

    // Optional: Sync models to ensure everything is in sync
    console.log('🔄 Syncing Sequelize models...');
    await sequelize.sync({ alter: true });
    console.log('✅ Models synchronized successfully!');

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
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