require('dotenv').config(); // Load this first

const { Pool } = require("pg");

const pool = new Pool({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_USERNAME,
	password: process.env.DB_PASSWORD,
	port: process.env.DB_PORT,
	ssl: process.env.DB_SSL === "false" ? false : true,
});

module.exports = { pool };
