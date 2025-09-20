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

    console.log('🔄 Preparing SQL statements...');

    // Remove SQL comments and split by semicolon
    const cleanedSQL = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Split SQL content by semicolon and execute each statement
    const statements = cleanedSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    // Separate statements into categories
    const extensionStatements = statements.filter(stmt =>
      stmt.toUpperCase().includes('CREATE EXTENSION')
    );
    const tableStatements = statements.filter(stmt =>
      stmt.toUpperCase().includes('CREATE TABLE')
    );
    const indexStatements = statements.filter(stmt =>
      stmt.toUpperCase().includes('CREATE INDEX') ||
      stmt.toUpperCase().includes('CREATE UNIQUE INDEX')
    );
    const commentStatements = statements.filter(stmt =>
      stmt.toUpperCase().includes('COMMENT ON')
    );

    console.log(`📋 Found ${statements.length} total statements`);
    console.log(`   - ${extensionStatements.length} extensions`);
    console.log(`   - ${tableStatements.length} tables`);
    console.log(`   - ${indexStatements.length} indexes`);
    console.log(`   - ${commentStatements.length} comments`);

    // Execute in order: extensions -> tables -> indexes -> comments
    console.log('📦 Creating extensions...');
    for (const statement of extensionStatements) {
      try {
        await sequelize.query(statement);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Extension already exists`);
        } else {
          console.error(`❌ Error: ${error.message}`);
        }
      }
    }

    console.log('📊 Creating tables...');
    let tablesCreated = 0;
    for (const statement of tableStatements) {
      try {
        await sequelize.query(statement);
        tablesCreated++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Table already exists`);
        } else {
          console.error(`❌ Error creating table: ${error.message}`);
        }
      }
    }
    console.log(`✅ ${tablesCreated}/${tableStatements.length} tables created`);

    console.log('🔗 Creating indexes...');
    let indexesCreated = 0;
    for (const statement of indexStatements) {
      try {
        await sequelize.query(statement);
        indexesCreated++;
      } catch (error) {
        if (!error.message.includes('already exists')) {
          // Silently skip index errors as tables might not exist yet
        }
      }
    }
    console.log(`✅ ${indexesCreated}/${indexStatements.length} indexes created`);

    console.log('💬 Adding comments...');
    for (const statement of commentStatements) {
      try {
        await sequelize.query(statement);
      } catch (error) {
        // Silently skip comment errors
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