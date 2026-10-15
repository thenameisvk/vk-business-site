'use strict';
const env = require('../config/env');

const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong.';
  const extra = err.extra || {};

  if (err.type === 'entity.parse.failed') { status = 400; message = 'The request body is not valid JSON.'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'The request is too large.'; }
  else if (err.name === 'CastError') { status = 400; message = 'Invalid id or value.'; }
  else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors || {})[0]?.message || 'Validation failed.';
  } else if (err.code === 11000) { status = 409; message = 'That value already exists.'; }

  if (status >= 500) {
    console.error('✖', req.method, req.originalUrl, '\n', err);
    if (env.NODE_ENV === 'production') message = 'Something went wrong. Please try again.';
  }
  res.status(status).json({ message, ...extra });
};

module.exports = { notFound, errorHandler };