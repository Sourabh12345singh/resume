async function runMigration() {
  console.log('MongoDB mode: no SQL migration needed.');
  console.log('Mongoose creates collections and indexes automatically.');
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration process failed:', error);
    process.exit(1);
  }); 