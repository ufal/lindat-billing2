const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');



exports.add = (service_id, user_id, price, unit, valid_from, valid_till) => {
  logger.trace();
  valid_till = valid_till || null;
  user_id = user_id ==="" ? null : user_id;
  return new promise((resolve, reject) => {
    db.one('INSERT INTO service_pricing(service_id, user_id, price, unit, valid_from, valid_till) VALUES($1, $2, $3, $4, $5, $6 ) RETURNING pricing_id',
        [service_id, user_id, price, unit, valid_from, valid_till])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No pricing_id returned',
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

exports.update = (pricing_id, service_id, user_id, price, unit, valid_from, valid_till) => {
  logger.trace();
  valid_till = valid_till || null;
  user_id = user_id ==="" ? null : user_id;
  return new promise((resolve, reject) => {
    db.one(`
      UPDATE service_pricing
      SET
        service_id = $2,
        user_id = $3,
        price = $4,
        unit = $5,
        valid_from = $6,
        valid_till = $7
      WHERE pricing_id = $1
      RETURNING pricing_id`,
        [pricing_id,service_id, user_id, price, unit, valid_from, valid_till])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No pricing_id returned',
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
    db.any(`
      SELECT
        sp.*,
        u.user_id as user_id,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        s.name as service_name,
        ( valid_from < CURRENT_TIMESTAMP and (valid_till IS NULL OR valid_till > CURRENT_TIMESTAMP)) as is_active
      FROM
        service_pricing sp
        LEFT JOIN users u ON u.user_id = sp.user_id
        JOIN services s ON sp.service_id = s.service_id
      `)
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

exports.getSinglePricing = (id) => {
  logger.trace();
  return new promise((resolve, reject) => {
    if(id === null) resolve({user_id: '', service_id: ''});
    db.one('SELECT * FROM service_pricing WHERE pricing_id = $1',[id])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No service pricing with given pricing_id',
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