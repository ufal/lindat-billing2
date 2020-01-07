const express = require('express');
const router = express.Router();
var moment = require('moment');
var requestIp = require('request-ip');
const logger = require('../logger');
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');
const dataController = require('../controllers/dataController');

router.post('/api/authenticate', function (req, res, next) {
  let email = req.body.email;
  let password = req.body.password;
  userController.authenticate(email, password)
    .then(data => {
      logger.trace();
      db.user.logAction(data.user_id, 'register');
      res.status(200);
      let token = getToken(data.user_id);
      res.json({
        success: true,
        message: 'Authentication successful. Use this token for other requests',
        token: token
      });
    })
    .catch(err => {
      logger.trace();
      res.status(401);
      res.json({
        status : false,
        message : err.error
      });
    });
});

router.post('/api/verify-endpoint', function (req, res, next) {
  let code = req.headers['x-access-token'];
  let endpointId = req.body.id;
  let IP = requestIp.getClientIp(req);
  userController.verifyEndpoint(endpointId, IP, code)
  .then(data => {
    if(data) {
      logger.trace();
      res.status(200);
      res.json({
        status : true,
        message : 'EndPoint Successfully Verified.'
      });
    } else {
      logger.trace();
      res.status(422);
      res.json({
        status : false,
        message : 'Invalid Arguments'
      });
    }
  })
  .catch(err => {
    logger.trace();
    if(err.extra.name=="QueryResultError") {
      res.status(422);
      res.json({
        status : false,
        message : 'Invalid Arguments'
      });
    }  else {
      res.status(500);
      res.json({
        status : false,
        message : 'Unknown Error'
      });
    }
  })

});

router.post('/api/tail-file', function (req, res, next) {
  let user = req.session.user;
  if (!user) {
    logger.trace();
    res.status(401);
    res.redirect(res.app.locals.baseUrl + "login");
  } else
  if (!user.is_admin){
    res.redirect(res.app.locals.baseUrl + "login", {error: "Permission Denied"})
  } else {
    logger.trace();
    let fileId = req.body.id;
    let tail = req.body.tail;
    adminController.tailLog(fileId, tail)
    .then(data => {
      logger.trace();
      res.status(200);
      res.json({
        status : true,
        message : 'Log file tail status updated.'
      });
    })
    .catch(error => {
      res.status(500);
      res.json({
        status : false,
        message : 'Unknown Error'
      });
    });
  }
});

// logged admin user !!!
router.use('/api/data', function (req, res, next) {
  let user = req.session.user;
  if (!user) {
    logger.trace();
    res.status(401);
    res.send({
        status : false,
        error : 'Unauthorized Request.'
      });
  }
  next()
});

router.param('filterUser',function (req, res, next, user){
  //TODO 'all' or 'userid'
  next();
})

router.param('serviceId',function (req, res, next, serviceId){
  const value = Math.floor(Number(serviceId));
  if(value === Infinity || String(value) !== serviceId || value < 0){
    throw new Error('Invalid Service id.');
  }
  next();
})

router.param('period',function (req, res, next, period){
  if(period.indexOf('--') != -1) throw new Error('Invalid period format.');
  const dateParts = period.split('-');
  if(dateParts.length  >  3) throw new Error('Invalid period format.');
  const date = [...dateParts,'01','01'].slice(0,3).join('-');
  if(! moment(date, 'YYYY-MM-DD',true).isValid()) throw new Error('Invalid period format.');
  const periods = ["year", "month", "day", "hour"];
  req.params.interval = periods[dateParts.length];
  req.params.duration = periods[dateParts.length - 1];
  req.params.date = date;
  req.params.datePath = dateParts;
  next();
})

router.get('/api/data/:filterUser/:serviceId/:period', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  if (req.params.filterUser != user.user_id && !user.is_admin) {
      res.status(403);
      res.send({
        status : false,
        error : 'Permission Denied.'
      });
  } else if (req.params.filterUser != 'all') {
    // get price instead of request count and user count
    dataController.getPeriodPrices(req.params.serviceId, req.params.date, req.params.duration, req.params.interval, req.params.datePath, req.params.filterUser).then(data => {
      res.json({
        status : true,
        log: data
      });
  }).catch();
  } else {
    // TODO get prices !!!
    dataController.getPeriodCounts(req.params.serviceId, req.params.date, req.params.duration, req.params.interval, req.params.datePath).then(data => {
      res.json({
        status : true,
        log: data
      });
    }).catch();
  }
});

router.get('/api/services', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  if (!user.is_admin) {// TODO filter only users data !!!
      res.status(403);
      res.send({
        status : false,
        error : 'Permission Denied.'
      });
  } else {
    dataController.getServices().then(data => {
      res.json({
        status : true,
        services: data
      });
    }).catch();
  }
});

// run for every request
router.use('/api', function (req, res, next) {
  let token = req.headers['x-access-token'];
  if (!token) {
    logger.trace();
    res.status(401)
    res.send({
      status : false,
      message : 'Authentication token missing.'
    });
  }
  jwt.verify(token, config.jwt.secret, function (err, decoded) {
    if (err) {
      logger.trace();
      res.status(401);
      res.send({
        status : false,
        message : 'Invalid authentication token.'
      });
    }
  });
  next();
});

getToken = (userId) => {
  logger.trace();
  let token = jwt.sign(
      { userId: userId },
        config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
  );
  return token;
};




module.exports = router;