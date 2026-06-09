require('dotenv').config()
const { Pool } = require('pg');

// Create a new pool instance using environment variables
const pool = new Pool({
	connectionString: process.env.POSTGRES_DATABASE_URL,
});

// Export a helper function for executing queries
module.exports = {
	query: (text, params) => pool.query(text, params),
};