const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('../db');

exports.addService = (userId, name, desc, prefix, color) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.service.add(name, desc, prefix, color)
    .then(data => {
      db.user.logAction(userId, 'addService');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getServices = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.service.get()
    .then(data => {
      db.user.logAction(userId, 'listServices');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getMonthlyCountsByService = (year) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.getMonthlyCountsByService(year)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getLogFiles = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.get()
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.tailLog = (fileId, tail) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.setLogTail(fileId, tail)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  }); 
}