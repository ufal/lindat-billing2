const express = require('express');
const router = express.Router();
var requestIp = require('request-ip');
const logger = require('../logger');
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');

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
    res.redirect("/login");
  } else 
  if (!user.is_admin){
    res.redirect("/login", {error: "Permission Denied"})
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