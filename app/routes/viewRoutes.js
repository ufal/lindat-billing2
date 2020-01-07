const express = require('express');
const router = express.Router();
const pug = require('pug');
const session = require('express-session');
const querystring = require('querystring');
const logger = require('../logger');
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');
const emailController = require('../controllers/emailController');

router.get('/login', function (req, res, next) {
  logger.trace();
  res.render('login');
});

router.get('/authenticate', function (req, res, next) {
  logger.trace();
  res.render('login', {error: 'Invalid Email or Password'});
});

router.get('/register', function (req, res, next) {
  logger.trace();
  res.render('register');
});

router.get('/forget-password', function (req, res, next) {
  logger.trace();
  res.render('forget-password');
});

router.get('/verify-account', function (req, res, next) {
  let email = querystring.unescape(req.query.user);
  let code = querystring.unescape(req.query.code);
  logger.debug(email, code);
  userController.verifyAccount(email, code)
    .then(data => {
      logger.trace();
      res.render('login', {message: 'Account verification successful, you can now login'});
    })
    .catch(err => {
      logger.trace();
      res.render('login', {error: 'Invalid verification code'});
    });
});

router.post('/register', function (req, res, next) {
  let email = req.body.email;
  let password = req.body.password;
  let fname = req.body.fname;
  let lname = req.body.lname;
  let org = req.body.org;
  if(!email || !password || !fname || !lname || !org) {
    logger.trace();
    res.render('register', {error: 'All the fields are required'});
  }
  userController.register(email, password, fname, lname, org)
    .then(data => {
      logger.trace();
      emailController.verifyAccount(email, fname, lname, data.verification_code)
      .then(data => {
        logger.trace();
        res.render("registration-successful");
      })
      .catch(err => {
        logger.trace();
        res.render("registration", {error: 'Unable to sent activation email, please contact the administrator'});
      });
    })
    .catch(err => {
      logger.trace();
      if(err.extra.constraint=='users_email_key') {
        res.render('register', {error: 'A user with this email already exists'});
      }
    });
});

router.get('/registration-successful', function (req, res, next) {
  logger.trace();
  res.render('registration-successful');
});

router.get('/logout', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  userController.logout(user.user_id);
  req.session.user = null;
  res.render('login', {message: 'Logged out successfully'});
});

router.post('/authenticate', function (req, res, next) {
  let email = req.body.email;
  let password = req.body.password;
  if(!email || !password) {
    logger.trace();
    res.render('login', {error: 'Invalid Email or Password'});
  }
  userController.authenticate(email, password)
    .then(data => {
      logger.trace();
      req.session.user = data;
      res.redirect(res.app.locals.baseUrl);
    })
    .catch(err => {
      logger.trace();
      logger.debug(err);
      res.status(401);
      res.render('login', {error: 'Invalid Email or Password'});
    });
});

router.use("/", function (req, res, next) {
  let user = req.session.user;
  if (!user) {
    logger.trace();
    res.status(401);
    res.redirect(res.app.locals.baseUrl + "login");
  } else {
    logger.trace();
    next();
  }
});

router.get('/', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  if(user.is_admin){
    //getAdminDashboard(user, res).catch(err => {
    //  logger.error(err);
    //});
    req.url = '/admin/dashboard';
    next();
  } else {
    req.url = '/user/dashboard';
    next();
  }
});

router.get('/user/dashboard', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  getUserDashboard(user, res).catch(err => {
    logger.error(err);
  });
});

router.get('/admin/dashboard', function (req, res, next) {
  logger.trace();
  let user = req.session.user;

  if(user.is_admin){
    getAdminDashboard(user, res).catch(err => {
      logger.error(err);
    });
  } else {
    res.status(401);
    res.redirect(res.app.locals.baseUrl + "login");
  }
});

router.get('/endpoints', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  userController.getUserEndpoints(user.user_id)
  .then(data => {
    res.render("endpoints", {user: user, endpoints: data, endpoints_active: true});
  })
  .catch(err => {
    res.render('endpoints', {user: user, error: 'No EndPoints Found', endpoints_active: true});
  });
});

router.get('/add-endpoint', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  res.render('add-endpoint', {user: user, endpoints_active: true});
});

router.post('/add-endpoint', function (req, res, next) {
  logger.trace();
  let name = req.body.name;
  let IP = req.body.ip;
  let user = req.session.user;
  if(!name || !IP) {
    logger.trace();
    res.render('/add-endpoint', {error: 'All the fields are required', endpoints_active: true});
  }
  userController.addUserEndpoint(user.user_id, name, IP)
    .then(data => {
      logger.trace();
      userController.getUserEndpoints(user.user_id)
      .then(data => {
        res.render("endpoints", {user: user, endpoints: data, endpoints_active: true, message: 'EndPoint added. Please follow the procedure in your email to verify EndPoint.'});
      })
      .catch(err => {
        res.render('endpoints', {user: user, endpoints_active: true, error: 'No EndPoints Found'});
      });
    })
    .catch(err => {
      logger.trace();
      if(err.extra.constraint=='user_endpoints_ip_key') {
        res.render('add-endpoint', {user: user, endpoints_active: true, error: 'A endpoint with this IP already exists'});
      }
    });
});


async function getAdminDashboard(user, res){
  const monthly = await adminController.getMonthlyCountsByService('2019-01-01');
  res.render('dashboard', {user: user, servicecounts: monthly, initialview: '2019-01', admin_dashboard_active: true, filteruser: 'all', datalines: ["users","requests"]});
}

async function getUserDashboard(user, res){
  const monthly = await userController.getMonthlyCountsByService(user.user_id, '2019-01-01');
  res.render('dashboard', {user: user, servicecounts: monthly, initialview: '2019-01', user_dashboard_active: true, filteruser: user.user_id, datalines: ["prices","requests"]});
}

module.exports = router;