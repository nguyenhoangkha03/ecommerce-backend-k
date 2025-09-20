#!/usr/bin/env node

const readline = require('readline');
const sequelize = require('../src/config/sequelize');
const createTables = require('./create-tables');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function resetDatabase() {
  try {
    console.log('⚠️  WARNING: This will DELETE ALL DATA in your database!');
    console.log('📊 Current database:', sequelize.config.database);

    const confirmation = await askQuestion('Are you sure you want to continue? (yes/no): ');

    if (confirmation.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled.');
      rl.close();
      return;
    }

    const secondConfirmation = await askQuestion('Type "DELETE ALL DATA" to confirm: ');

    if (secondConfirmation !== 'DELETE ALL DATA') {
      console.log('❌ Operation cancelled.');
      rl.close();
      return;
    }

    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();

    console.log('🗑️  Dropping all tables...');
    await sequelize.drop({ cascade: true });

    console.log('🔄 Creating fresh tables...');
    await createTables();

    console.log('✅ Database reset completed successfully!');

  } catch (error) {
    console.error('❌ Error resetting database:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  resetDatabase()
    .then(() => {
      console.log('🎉 Database reset completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to reset database:', error);
      process.exit(1);
    });
}

module.exports = resetDatabase;