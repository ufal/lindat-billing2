const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');

exports.add = (name, desc, prefix, color) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('INSERT INTO services(name, description, prefix, color) VALUES($1, $2, $3, x$4::INT) RETURNING service_id',
        [name, desc, prefix, color])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No service_id returned',
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
    db.any('SELECT * FROM services')
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No services returned',
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