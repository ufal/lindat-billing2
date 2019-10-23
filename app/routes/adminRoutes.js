const express = require('express');
const router = express.Router();
const pug = require('pug');
const session = require('express-session');
const querystring = require('querystring');
const logger = require('../logger');
const adminController = require('../controllers/adminController');


router.use("/admin", function (req, res, next) {
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
    next();
  }
});

router.get('/admin/services', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  adminController.getServices(user.user_id)
  .then(data => {
    res.render('services', {user: user, services: data, services_active: true});
  })
  .catch(err => {
    res.render('services', {user: user, error: 'No Service Found', services_active: true});
  });
});

router.get('/admin/add-service', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  res.render('add-service', {user: user, services_active: true});
});

router.post('/admin/add-service', function (req, res, next) {
  logger.trace();
  let name = req.body.name;
  let desc = req.body.desc;
  let prefix = req.body.prefix;
  let color = req.body.color;
  let user = req.session.user;
  if(!name || !desc || !prefix || !color) {
    logger.trace();
    res.render('/admin/add-service', {services_active: true, error: 'All the fields are required'});
  }
  adminController.addService(user.user_id, name, desc, prefix, color)
    .then(data => {      
      logger.trace();
      adminController.getServices(user.user_id)
      .then(data => {
        res.render("services", {user: user, services_active: true, services: data, message: 'Service added successfully'});
      })
      .catch(err => {
        res.render('services', {user: user, services_active: true, error: 'No Service Found'});
      });            
    })
    .catch(err => {
      logger.trace();
      if(err.extra.constraint=='services_name_key' || err.extra.constraint=='services_prefix_key') {
        res.render('add-service', {user: user, services_active: true, error: 'A service with this name or prefix already exists'});
      }
    });
});

router.get('/admin/users', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  adminController.getUsers(user.user_id)
  .then(data => {
    console.log(data);
    res.render('users', {user: user, users: data, users_active: true});
  })
  .catch(err => {
    res.render('users', {user: user, error: 'No User Found', users_active: true});
  });
});

router.get('/admin/user/:userId', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  adminController.getUser(user.user_id, req.params.userId)
  .then(data => {
    res.render('user-detail', {user: user, user_detail: data, users_active: true});
  })
  .catch(err => {
    res.render('user-detail', {user: user, error: 'No User Found', users_active: true});
  });
});

router.get('/admin/logmanagement', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  adminController.getLogFiles()
  .then(data => {
    logger.trace();
    res.render('logmanagement', {user: user, logs: data, logmanagement_active: true});
  })
  .catch(err => {
    logger.trace();
    res.render('logmanagement', {user: user, logmanagement_active: true});
  })  
});

module.exports = router;