'use strict';
const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDB() {
  mongoose.connection.on('connected', () => console.log(`✔ MongoDB connected (${mongoose.connection.name})`));
  mongoose.connection.on('disconnected', () => console.warn('⚠ MongoDB disconnected'));
  mongoose.connection.on('error', (e) => console.error('✖ MongoDB error:', e.message));

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,            // Atlas M0 allows 500 connections; 10 is plenty for one server
    autoIndex: env.AUTO_INDEX,
  });
}

module.exports = connectDB;