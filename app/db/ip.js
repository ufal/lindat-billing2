const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');
const moment = require('moment');

const date2string_def = {
  'month': {
    'full': 'YYYY-MM-01 00:00:00',
    'header': 'YYYY-MM'
  },
  'day': {
    'full': 'YYYY-MM-DD 00:00:00',
    'header': 'YYYY-MM-DD'
  }
};

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


function date2string(date=new Date(), level='month', type='full'){
  return date.format(date2string_def[level][type])
}


function createFilter(filter){

  logger.warn('IP filter is not implemented');
  var query={
    'pivot_ip': {
      'filter_ip' : '',
      'filter_period' : '',
      'filter_service' : ' AND lg.service_id IS NULL '
    },
    'pivot_val': { // change to row !!!
      'filter_service' : ' AND data.service_id IS NULL '
    },
    'pivot_col': {
      'names': ' ip INET ',
      'values': ''
    }
  };
  var values={};
  var header=['ip'];

  values.level = filter.period.level;
  values.period_interval = '1 ' + values.level;
  query.pivot_ip.filter_period = ' AND lg.period_start_date >= \'$<filter.period_start>\'  AND lg.period_end_date < \'$<filter.period_end>\' ';
  values.period_start = date2string(filter.period.start,filter.period.level,'full');
  values.period_end = date2string(filter.period.end,filter.period.level,'full');
  query.pivot_col.values = `generate_series(
              date_trunc(\'$<filter.level>\', timestamp \'$<filter.period_start>\'),
              date_trunc(\'$<filter.level>\', timestamp \'$<filter.period_end>\' - interval \'$<filter.period_interval>\'),
              \'$<filter.period_interval>\'::interval
            )`;

  var date_i = filter.period.start;
  while(date_i < filter.period.end){
    var date_str = date2string(date_i,filter.period.level,'header');
    query.pivot_col.names += ', "'+date_str+'" BIGINT ';
    header.push(date_str);
    date_i = date_i.add(1,filter.period.level+'s');
  }
  if(typeof filter.service_id !== 'undefined'){
    logger.warn('result contains only single/all services');
    query.pivot_ip.filter_service  = ' AND lg.service_id = $<filter.service_id> ';
    query.pivot_val.filter_service = ' AND data.service_id = $<filter.service_id> ';
    values.service_id = filter.service_id;
  }

  return {
    query: query,
    values: values,
    header: header
  }
}



exports.getTop = (filter={},
                  period_start = (new Date().getFullYear())+'-01-01 00:00:00',
                  period_end = (new Date().getFullYear() + 1)+'-01-01 00:00:00',
                  measure='units',
                  level='month',
                  min_exist = 0
                ) => {
  logger.trace();
  logger.warn('db.ip.getTop() uses only default settings !!!');
  const {query, values, header} = createFilter({
                                        'period': {
                                          'start': moment(period_start),
                                          'end': moment(period_end),
                                          'level': level
                                        },
                                        'value':{
                                          'measure': measure,
                                          'min_exist': min_exist
                                        },
                                        ...filter
                                      });
  return new promise((resolve, reject) => {
    db.any(`
SELECT *
FROM crosstab(
      'SELECT top.ip,to_char(data.period_start_date,''YYYY-MM-DD 00:00:00''),COALESCE(data.cnt_${measure},0)
       FROM
         ( SELECT DISTINCT ip
           FROM log_ip_aggr lg
           WHERE
             lg.cnt_${measure} > $<min_exist>
             AND lg.period_level=\'$<filter.level>\'::period_levels
             ${query.pivot_ip.filter_ip}
             ${query.pivot_ip.filter_period}  -- AND lg.period_start_date >= ''2021-01-01 00:00:00''  AND lg.period_end_date < ''2022-01-01 00:00:00''
             ${query.pivot_ip.filter_service} -- AND lg.service_id IS NULL
          ) AS top
         JOIN log_ip_aggr data
           ON data.ip = top.ip
       WHERE data.period_level=\'$<filter.level>\'::period_levels
         ${query.pivot_val.filter_service}  -- AND data.service_id IS NULL
       ORDER BY 1,2',
      'SELECT s::timestamp
       FROM
            ${query.pivot_col.values} s'
       ) as pivot (
               -- column names
               ${query.pivot_col.names}
               );
        `, {
          'min_exist': min_exist,
          'filter': values
        })
        .then(data => {
          logger.trace();
          if (data) {
              resolve({data: data, header: header}); // data
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
              (coalesce(ml0.cnt_requests,0) + coalesce(ml1.cnt_requests,0) + coalesce(ml2.cnt_requests,0)) AS requests,
              (coalesce(ml0.cnt_units,0) + coalesce(ml1.cnt_units,0) + coalesce(ml2.cnt_units,0)) AS units
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

