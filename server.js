
require('dotenv').config();

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.promises.setServers(['8.8.8.8', '1.1.1.1']);

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const restaurantRoutes = require('./routes/restaurants');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'dbRestaurants';

if (!MONGODB_URI) {
  console.error('\nMissing MONGODB_URI. Copy .env.example to .env and paste your Atlas connection string.\n');
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/restaurants', restaurantRoutes);

app.use('/api', (req, res) =>
  res.status(404).json({ error: 'Unknown API route.' })
);

// Central error handler: always answer the browser with JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: Object.values(err.errors)[0].message
    });
  }

  res.status(500).json({
    error: 'Something went wrong on the server. Please try again.'
  });
});

mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log(`Connected to MongoDB Atlas (database: ${DB_NAME})`);

    app.listen(PORT, () => {
      console.log(`URBANPLATE is running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB Atlas:', err.message);
    process.exit(1);
  });
