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


router.get('/tokens', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  userController.getUserTokens(user.user_id)
  .then(data => {
    res.render("tokens", {user: user, tokens: data, tokens_active: true});
  })
  .catch(err => {
    res.render('tokens', {user: user, error: 'No Tokens Found', tokens_active: true});
  });
});

router.get('/add-token', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  res.render('add-token', {user: user, tokens_active: true});
});

router.post('/add-token', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  userController.addUserToken(user.user_id)
    .then(data => {
      res.render('tokens', {user: user, error: 'TODO - token generating', tokens_active: true});
    })
    .catch(err => {
      res.render('tokens', {user: user, error: 'adding new token failed', tokens_active: true});
    })
});


async function getAdminDashboard(user, res){
  const len = 28;
  let d = new Date();
  d.setDate(d.getDate() - 1);
  const last_date = d.toISOString().slice(0,10);
  const weekly = await adminController.getWeeklyCountsByService(last_date, len);
  res.render('dashboard', {user: user, servicecounts: weekly, period_length: len, date: Date.parse(last_date), initialview: d.toISOString().slice(0,7), admin_dashboard_active: true,type: 'user', filter: 'all', datalines: ["units", "requests", "body_bytes_sent"]});
}

async function getUserDashboard(user, res){
  const len = 28;
  const last_date = (new Date).toISOString().slice(0,10);
  const weekly = await userController.getWeeklyCountsByService(user.user_id, last_date , len);
  res.render('dashboard', {user: user, servicecounts: weekly, period_length: len, date: Date.parse(last_date), initialview: d.toISOString().slice(0,7), user_dashboard_active: true, type: 'user', filter: user.user_id, datalines: ["units", "requests", "body_bytes_sent"]});
}

module.exports = router;