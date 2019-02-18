const express = require('express');
const router = express.Router();
const config = require('config');
const jwt = require('jsonwebtoken');
const pug = require('pug');
const logger = require('../logger');
const viewRoutes = require('./viewRoutes');
const apiRoutes = require('./apiRoutes');
const adminRoutes = require('./adminRoutes');

router.use('/', apiRoutes);
router.use('/', viewRoutes);
router.use('/', adminRoutes);

// catch 404 and forward to error handler
router.use(function (req, res, next) {
  logger.trace();
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
router.use(function (err, req, res, next) {
  logger.trace();
  // render the error page
  res.status(err.status || 500);
  res.json({
    status : false,
    message : err.message,
  });
});

module.exports = router;