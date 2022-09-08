const express = require('express');
const router = express.Router();
const pug = require('pug');
const session = require('express-session');
var moment = require('moment');
const querystring = require('querystring');
const logger = require('../logger');
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');

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
  res.render('users', {user: user, users_active: true});
});


router.get('/admin/add-user', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  res.render('add-user', {user: user, users_active: true});
});

router.post('/admin/add-user', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  let first_name = req.body.first_name;
  let last_name = req.body.last_name;
  let email = req.body.email;
  let organization = req.body.organization;
  let note = req.body.note;
  let is_paying = (typeof req.body.is_paying !== 'undefined');
  let is_active = (typeof req.body.is_active !== 'undefined');
  let is_admin = (typeof req.body.is_admin !== 'undefined');
  let is_verified = true;
  let password = (Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2).toUpperCase()).split('').sort(function(){return 0.5-Math.random()}).join('');;
  if(!first_name || !last_name || !email ) {
    logger.trace();
    res.render('/admin/add-user', {users_active: true, error: 'All the fields are required'});
  }
  logger.info("ADDING USER", first_name, last_name, email, organization, note, is_paying, is_active, is_admin);
  adminController.addUser(user.user_id, first_name, last_name, email, organization, note, is_paying, is_active, is_admin, is_verified, password)
    .then(data => {
      logger.trace();
        res.render("users", {user: user, users_active: true, message: 'User added successfully'});
    })
    .catch(err => {
      logger.trace();
      if(err.extra.constraint=='services_name_key' || err.extra.constraint=='services_prefix_key') {
        res.render('add-service', {user: user, services_active: true, error: 'A service with this name or prefix already exists'});
      }
    });
});


router.get('/admin/user/:userId', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  adminController.getUser(user.user_id, req.params.userId)
  .then(data => {
    const len = 21;
    const last_date = (new Date).toISOString().slice(0,10);
    userController.getWeeklyCountsByService(req.params.userId, last_date , len).then(weekly => {
      res.render('user-detail', {
                           user: user,
                           servicecounts: weekly,
                           period_length: len,
                           date: Date.parse(last_date),
                           initialview: (new Date).toISOString().slice(0,7),
                           users_active: true,
                           user_detail: data,
                           type: 'user',
                           filter: req.params.userId,
                           datalines: ["units", "requests", "body_bytes_sent"]
                         });
     })
  })
  .catch(err => {
    res.render('user-detail', {user: user, error: 'No User Found', users_active: true});
  });
});



router.get('/admin/ips', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  let val = {
                measure: req.query.measure || 'units',
                level: req.query.level || 'month',
                start: req.query.start ||  (new Date().getFullYear())+'-01-01',
                end: req.query.end ||  (new Date().getFullYear()+1)+'-01-01',
                min_exist: req.query.min_exist ||  8000,
                tokens_incl: req.query.tokens_incl,
                service: req.query.service,
                service_exc: req.query.service_exc
            };
  var table_params = [];

  for (const [k,v] of Object.entries(val)){
    if(v != '' && typeof v !== 'undefined') {
      table_params.push(`${k}=${v}`);
    } else {
      val[k] = undefined;
    }
  }
  adminController.getServices(user.user_id).then(services => {
    res.render('ips', {
                      user: user,
                      ips_active: true,
                      measures: [
                        {
                          val: "units",
                          text: "Input NFC length (infclen)"
                        },
                        {
                          val: "requests",
                          text: "Number of requests"
                        },
                        {
                          val:  "body_bytes_sent",
                          text:  "Output 'body bytes sent' (includes overhead)"
                        }
                      ],
                      levels: ["month", "day"],
                      services: services.map(s => [s.service_id, s.name]),
                      val: val,
                      table_params: table_params.join('&')
                    });
  })
});

router.get('/admin/ip/:ip', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  const len = 21;
  const last_date = (new Date).toISOString().slice(0,10);
  adminController.getWeeklyCountsByService(last_date , len, {ip: req.params.ip})
  .then(data => {
    res.render('ip-detail',
            {
              user: user,
              servicecounts: data,
              period_length: len,
              date: Date.parse(last_date),
              initialview: (new Date).toISOString().slice(0,7),
              ips_active: true,
              type: 'ip',
              filter: req.params.ip,
              datalines: ["units", "requests", "body_bytes_sent"]
            });
  })
  .catch(err => {
    res.render('ip-detail', {user: user, error: 'No IP Found', ips_active: true});
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
  const subaction = req.query.action;
  const pricing_id = req.query.pricing_id;
  let user = req.session.user;
  var users = adminController.getUsers(user.user_id);
  var services = adminController.getServices(user.user_id);
  var pricing = adminController.getPricing(user.user_id, pricing_id ? pricing_id : null);
  const action = 'new';
  console.log(action, subaction, pricing_id);
  Promise.all([users, services, pricing])
    .then(values => {
      console.log(values);
      res.render('add-pricing', {user: user, users: values[0], services: values[1], pricing: values[2], pricing_active: true, action: action, subaction: subaction});
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
  const subaction = req.query.action;
  Promise.all([users, services, pricing])
    .then(values => {
      console.log(values);
      res.render('add-pricing', {user: user, users: values[0], services: values[1], pricing: values[2], pricing_active: true, action: action, subaction: subaction});
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
  const subaction = req.body.subaction;
  if(!service_id || !price || !unit || !valid_from) {
    logger.trace();
    res.render('/admin/pricing/'+pricing_id, {services_active: true, error: 'Fill required fields'});
  }
  adminController.updatePricing(user.user_id, pricing_id, service_id, user_id, price, unit, valid_from, valid_till)
    .then(data => {
      logger.trace();
      if(subaction == 'split') {
        res.redirect('/admin/add-pricing?action=newcopy&pricing_id='+req.params.pricingId);
      } else {
        adminController.getPrices(user.user_id)
          .then(data => {
          res.render('pricing', {user: user, pricing: data, pricing_active: true});
        })
        .catch(err => {
          res.render('pricing', {user: user, error: 'No Pricing Found', pricing_active: true});
        });
      }
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

router.get('/admin/add-endpoint', function (req, res, next) {
  logger.trace(req.query, req.session.user);
  let user = req.session.user;
  res.render('add-endpoint', {user: user, user_id: req.query.user_id, ip: req.query.ip, start_date: moment(new Date).format('YYYY-MM-DD'), action: 'new' });
});

router.post('/admin/add-endpoint', function (req, res, next) {
  logger.trace();
  let name = req.body.name;
  let IP = req.body.ip;
  let user_id = req.body.user_id;
  let is_verified = true;
  let is_active = req.body.start_date ? true : false;
  let start_date = req.body.start_date;
  let user = req.session.user;
  if(!name || !IP) {
    logger.trace();
    res.render('/admin/add-endpoint', {error: 'All the fields are required', endpoints_active: true});
  }
  userController.addUserEndpoint(user_id, name, IP, is_verified, is_active, start_date)
    .then(data => {
      logger.trace();
      let user = req.session.user;
      adminController.getUser(user.user_id, user_id)
      .then(data => {
        res.render('user-detail', {user: user, user_detail: data, users_active: true});
      })
      .catch(err => {
        res.render('user-detail', {user: user, error: 'No User Found', users_active: true});
      });
    })
    .catch(err => {
      logger.warn(err);
      if(err.extra.constraint=='user_endpoints_ip_key') {
        res.render('add-endpoint', {user: user, endpoints_active: true, error: 'A endpoint with this IP already exists'});
      }
    });
});

router.get('/admin/endpoint/:endpoint', function (req, res, next) {
  logger.trace();
  let user = req.session.user;
  const len = 21;
  const last_date = (new Date).toISOString().slice(0,10);
  adminController.getWeeklyCountsByService(last_date , len, {endpoint_id: req.params.endpoint})
  .then(data => {
    res.render('endpoint-detail',
            {
              user: user,
              servicecounts: data,
              period_length: len,
              date: Date.parse(last_date),
              initialview: (new Date).toISOString().slice(0,7),
              users_active: true,
              type: 'endpoint',
              filter: req.params.endpoint,
              datalines: ["units", "requests", "body_bytes_sent"]
            });
  })
  .catch(err => {
    res.render('endpoint-detail', {user: user, error: 'No Endpoint Found', users_active: true});
  });
});

module.exports = router;