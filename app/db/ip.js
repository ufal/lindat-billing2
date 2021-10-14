const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');

exports.get = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any(`SELECT
              y.ip,
              sum(y.cnt_requests) AS cnt_requests,
              sum(y.cnt_units) AS cnt_units,
              min(y.period_start_date) AS start,
              max(y.period_end_date) AS end
            FROM
              log_ip_aggr y
            WHERE
              y.service_id IS NULL
              AND y.period_level = 'year'::period_levels
            GROUP BY y.ip
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

exports.getRecent = () => { /* return only last three months*/
  logger.trace();
  return new promise((resolve, reject) => {
    db.any(`SELECT
              ml.ip,
              ml2.period_start_date AS start,
              ml0.period_end_date AS end,
              ml2.cnt_requests AS m2_requests,
              ml2.cnt_units AS m2_units,
              ml1.cnt_requests AS m1_requests,
              ml1.cnt_units AS m1_units,
              ml0.cnt_requests AS m0_requests,
              ml0.cnt_units AS m0_units,
              (coalesce(ml0.cnt_requests,0) + coalesce(ml2.cnt_requests,0) + coalesce(ml2.cnt_requests,0)) AS requests,
              (coalesce(ml0.cnt_units,0) + coalesce(ml2.cnt_units,0) + coalesce(ml2.cnt_units,0)) AS units
            FROM
              (
                SELECT m.ip
                FROM log_ip_aggr m
                WHERE
                  m.service_id IS NULL
                  AND m.period_level = 'month'::period_levels
                  AND m.period_start_date >= NOW() - interval '3 month'
                GROUP BY m.ip
              ) ml
              LEFT JOIN
              (
                SELECT *
                FROM log_ip_aggr m0
                WHERE
                  m0.service_id IS NULL
                  AND m0.period_level = 'month'::period_levels
                  AND m0.period_start_date >= NOW() - interval '1 month'
              ) ml0 ON ml0.ip = ml.ip
              LEFT JOIN
              (
                SELECT *
                FROM log_ip_aggr m1
                WHERE
                  m1.service_id IS NULL
                  AND m1.period_level = 'month'::period_levels
                  AND m1.period_start_date >= NOW() - interval '2 month'
                  AND m1.period_start_date < NOW() - interval '1 month'
              ) ml1 ON ml1.ip = ml.ip
              LEFT JOIN
              (
                SELECT *
                FROM log_ip_aggr m2
                WHERE
                  m2.service_id IS NULL
                  AND m2.period_level = 'month'::period_levels
                  AND m2.period_start_date >= NOW() - interval '3 month'
                  AND m2.period_start_date < NOW() - interval '2 month'
              ) ml2 ON ml2.ip = ml.ip
            ORDER BY units DESC, requests DESC`
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

