const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');

exports.add = (userId, name, IP, is_verified = false, is_active = false, start_date = null) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('INSERT INTO user_endpoints(user_id, name, ip, is_verified, is_active, start_date) VALUES($1, $2, $3, $4, $5, $6) RETURNING endpoint_id',
        [userId, name, IP, is_verified, is_active, start_date])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No endpoint_id returned',
              extra: null
            });
          }
        })
        .catch(error => {
          logger.trace();
          logger.error(error);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};


exports.get = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any('SELECT * FROM user_endpoints')
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No endpoints returned',
              extra: null
            });
          }
        })
        .catch(error => {
          logger.trace();
          logger.error(error);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

exports.get = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any('SELECT * FROM user_endpoints WHERE user_id=$1', [userId])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No endpoints returned',
              extra: null
            });
          }
        })
        .catch(error => {
          logger.trace();
          logger.error(error);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

exports.verify = (endpointId, IP, code) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('UPDATE user_endpoints SET is_verified=TRUE, is_active=TRUE, verification_code=NULL, start_time=NOW() WHERE endpoint_id=$1 AND ip=$2 AND verification_code=$3 RETURNING endpoint_id',
     [endpointId, IP, code])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No endpoints returned',
              extra: null
            });
          }
        })
        .catch(error => {
          logger.trace();
          logger.error(error);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};