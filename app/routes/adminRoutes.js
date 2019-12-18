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

router.get('/admin/pricing', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  adminController.getPrices(user.user_id)
  .then(data => {
    logger.debug(data, data.length);
    res.render('pricing', {user: user, pricing: data, pricing_active: true});
  })
  .catch(err => {
    res.render('pricing', {user: user, error: 'No Pricing Found', pricing_active: true});
  });
});

router.get('/admin/add-pricing', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  var users = adminController.getUsers(user.user_id);
  var services = adminController.getServices(user.user_id);
  var pricing = adminController.getPricing(user.user_id, null);
  const action = 'new';
  Promise.all([users, services, pricing])
    .then(values => {
      console.log(values);
      res.render('add-pricing', {user: user, users: values[0], services: values[1], pricing: values[2], pricing_active: true, action: action});
    })
    .catch(err => {
    res.render('add-pricing', {user: user, error: '', pricing_active: true, action: action});
  });
});

router.post('/admin/pricing', function (req, res, next) {
  logger.trace();
  let service_id = req.body.service;
  let user_id = req.body.user;
  let price = req.body.price;
  let unit = req.body.unit;
  let valid_from = req.body.valid_from;
  let valid_till = req.body.valid_till;
  let user = req.session.user;
  if(!service_id || !price || !unit || !valid_from) {
    logger.trace();
    res.render('/admin/add-pricing', {services_active: true, error: 'Fill required fields'});
  }
  adminController.addPricing(user.user_id, service_id, user_id, price, unit, valid_from, valid_till)
    .then(data => {
      logger.trace();
      adminController.getPrices(user.user_id)
      .then(data => {
        res.render('pricing', {user: user, pricing: data, pricing_active: true});
      })
      .catch(err => {
        res.render('pricing', {user: user, error: 'No Pricing Found', pricing_active: true});
      });
    })
    .catch(err => {
      logger.trace();
      logger.debug("== ERR ", err);

    });
});

router.get('/admin/pricing/:pricingId', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  var users = adminController.getUsers(user.user_id);
  var services = adminController.getServices(user.user_id);
  var pricing = adminController.getPricing(user.user_id, req.params.pricingId);
  const action = 'update';
  Promise.all([users, services, pricing])
    .then(values => {
      console.log(values);
      res.render('add-pricing', {user: user, users: values[0], services: values[1], pricing: values[2], pricing_active: true, action: action});
    })
    .catch(err => {
    res.render('add-pricing', {user: user, error: '', pricing_active: true, action: action});
  });
});

router.put('/admin/pricing/:pricingId', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  let pricing_id = req.params.pricingId;
  let service_id = req.body.service;
  let user_id = req.body.user;
  let price = req.body.price;
  let unit = req.body.unit;
  let valid_from = req.body.valid_from;
  let valid_till = req.body.valid_till;
  if(!service_id || !price || !unit || !valid_from) {
    logger.trace();
    res.render('/admin/pricing/'+pricing_id, {services_active: true, error: 'Fill required fields'});
  }
  adminController.updatePricing(user.user_id, pricing_id, service_id, user_id, price, unit, valid_from, valid_till)
    .then(data => {
      logger.trace();
      adminController.getPrices(user.user_id)
      .then(data => {
        res.render('pricing', {user: user, pricing: data, pricing_active: true});
      })
      .catch(err => {
        res.render('pricing', {user: user, error: 'No Pricing Found', pricing_active: true});
      });
    })
    .catch(err => {
      logger.trace();
      logger.debug("== ERR ", err);

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