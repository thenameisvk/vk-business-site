'use strict';
const { AppError } = require('../utils/http');

/** validate({ body: schema, query: schema, params: schema }) → parsed data on req.valid */
const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const [part, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.') || part, message: i.message }));
      return next(new AppError(400, errors[0].message, { errors }));
    }
    req.valid[part] = result.data;
  }
  return next();
};

module.exports = validate;