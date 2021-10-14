const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');

exports.get = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any(`SELECT
              ip,
              sum(cnt_requests) AS cnt_requests,
              sum(cnt_units) AS cnt_units,
              min(period_start_date) AS start,
              max(period_end_date) AS end
            FROM log_ip_aggr
            WHERE
              service_id IS NULL
              AND period_level = 'year'::period_levels
            GROUP BY ip
            ORDER BY cnt_units DESC, cnt_requests DESC`
          ) /*  LIMIT ?*/
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No IPs returned',
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
