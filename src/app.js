const express = require('express');
const aiRoutes = require('./routes/ai.routes')
const cors = require('cors')
const db = require('./database')
const app = express()

app.use(cors())

app.use(express.json())

async function testConnection() {
	try {
		// Run a basic diagnostic query to fetch the current timestamp
		const res = await db.query('SELECT current_database()');
		console.log('Database connection successful!');
		console.log('Current Database:', res.rows[0].current_database);
	} catch (err) {
		console.error('Error connecting to the database:', err.message);
	}
}

testConnection();
app.get('/', (req, res) => {
	res.send('Hello World')
})

app.use('/api/ai', aiRoutes)

module.exports = app