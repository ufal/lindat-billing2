const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('../db');

exports.authenticate = (email, password) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.user.authenticate(email, password)
    .then(data => {
      db.user.logAction(data.user_id, 'login');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.register = (email, password, fname, lname, org) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.user.register(email, password, fname, lname, org)
    .then(data => {
      db.user.logAction(data.user_id, 'register');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.verifyAccount = (email, code) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.user.verifyAccount(email, code)
    .then(data => {
      db.user.logAction(data.user_id, 'verify');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getUserEndpoints = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.endpoint.get(userId)
    .then(data => {
      db.user.logAction(userId, 'getUserEndPoints');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.addUserEndpoint = (userId, name, IP) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.endpoint.add(userId, name, IP)
    .then(data => {
      db.user.logAction(userId, 'addUserEndPoint');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};


exports.verifyEndpoint = (endpointId, IP, code) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.endpoint.verify(endpointId, IP, code)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};



exports.logout = (userId) => {
  db.user.logAction(userId, 'logout');
};

exports.getMonthlyCountsByService = (userId, date) => {
  logger.trace();
  console.log(date,userId);
  return new promise((resolve, reject) => {
    db.logs.getMonthlyCountsByService(date, {user_id: userId})
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getWeeklyCountsByService = (userId, date, len) => {
  logger.trace();
  console.log(date,userId);
  return new promise((resolve, reject) => {
    db.logs.getWeeklyCountsByService(date, len, {user_id: userId})
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};