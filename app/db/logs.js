const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');


exports.get = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any('SELECT * FROM log_files')
        .then(data => {
            logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.trace();
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};


exports.getLogFile = (fileName, firstLineChecksum) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('SELECT * FROM log_files WHERE file_name = $1 AND first_line_checksum = $2', [fileName, firstLineChecksum])
        .then(data => {
            logger.trace();
            logger.debug('File exists in DB ' + fileName);
            resolve(data); // data
        })
        .catch(error => {
          logger.trace(fileName);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};


exports.addLogFile = (fileName, firstLineChecksum, tail=false) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('INSERT INTO log_files(file_name, first_line_checksum, tail) VALUES($1, $2, $3) RETURNING file_id', [fileName, firstLineChecksum, tail])
        .then(data => {
            logger.trace();
            logger.debug('Initialized file in DB ' + fileName);
            resolve(data); // data
        })
        .catch(error => {
          logger.trace(fileName);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

exports.setLogTail = (fileId, tail) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('UPDATE log_files SET tail = $2 WHERE file_id = $1 RETURNING file_id', [fileId, tail])
        .then(data => {
            logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.trace();
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

exports.checkLogEntry = (obj) => {
  return new promise((resolve, reject) => {
    db.one('SELECT * FROM log_file_entries WHERE file_id = $1 AND line_number = $2 AND line_checksum = $3', [obj.file_id, obj.line_number, obj.line_checksum])
        .then(data => {
            logger.trace();
            logger.debug('Line exists in DB ');
            resolve(data); // data
        })
        .catch(error => {
          //logger.trace(obj.file_id);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
}

exports.addLogEntries = (obj) => {
  //logger.trace();
  return new promise((resolve, reject) => {
    db.one('INSERT INTO log_file_entries('
        +'file_id, service_id, line_number, line_checksum, remote_addr, remote_user, time_local, method, request, protocol, status, body_bytes_sent, http_referer, http_user_agent, unit)'
        + 'VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING time_local',
        [obj.file_id, obj.service_id, obj.line_number, obj.line_checksum, obj.remote_addr, obj.remote_user, obj.time_local, obj.method, obj.request, obj.protocol, obj.status, obj.body_bytes_sent, obj.http_referer, obj.http_user_agent, obj.unit])
        .then(data => {
            //logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.debug(obj.file_id, obj);
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

exports.getMonthlyCountsByService = (date, filter) => {
  logger.trace();
  logger.debug("TODO implement filter");
  const {query, values} = createFilter(filter);
  return new promise((resolve, reject) => {
    db.any(`
      SELECT
        s.name AS name,
        s.service_id AS service_id,
        s.color AS color,
        date_part('day', l.time_local) AS month,
        count(1) AS count
      FROM
        log_file_entries l
        JOIN services s on l.service_id=s.service_id
        ` + query + `
      WHERE
        date_part('year', l.time_local) = date_part('year', timestamp $1)
        AND date_part('month', l.time_local) = date_part('month', timestamp $1)
      GROUP BY name, s.service_id, color, month
      `, [date, ...values])
        .then(data => {
            logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.trace();
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

exports.getWeeklyCountsByService = (date, len, filter) => {
  logger.trace();
  logger.debug("TODO implement filter");
  const {query, values, table} = createFilter(filter,2);
  return new promise((resolve, reject) => {
    const days_list = `
    with days as (
      SELECT ROW_NUMBER () OVER (ORDER BY day) as ord, day FROM generate_series(
        date_trunc('day', timestamp $1 - interval '$2 day'),
        date_trunc('day', timestamp $1),
        '1 day'::interval
      ) as day
    ) `;
    db.any(
      days_list
      + `
      SELECT
        s.name AS name,
        s.service_id AS service_id,
        s.color AS color,
        d.day AS day,
        d.ord AS ord,
        coalesce(cnt_requests,0) AS count
      FROM
        days d
        CROSS JOIN services s
        LEFT JOIN
            (
              SELECT
                la.service_id,
                la.period_start_date,
                sum(coalesce(la.cnt_requests,0)) as cnt_requests
              FROM ` + table + ` la
              WHERE period_start_date >= timestamp $1 - interval '$2 day'
                AND period_start_date < timestamp $1 + interval '1 day'
                AND period_level = 'day'::period_levels
                 ` + query +`
              GROUP BY la.service_id, la.period_start_date
            )  l
         ON l.service_id=s.service_id AND l.period_start_date=d.day
      GROUP BY name, s.service_id, color, d.day, d.ord, l.cnt_requests
      `, [date, len-1, ...values])
        .then(data => {
            logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.trace();
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};


function createFilter(filter, add=1){
  var query="";
  var values=[];
  var table="";
  if('user_id' in filter) {
    //JOIN (SELECT service_id FROM service_pricing WHERE user_id=$2) p ON l.service_id = p.service_id
    values.push(filter['user_id']);
    query += ' AND  endpoint_id IN (SELECT endpoint_id FROM user_endpoints WHERE user_id=$'+ (values.length+add) +' AND is_verified=TRUE) ';
    table = "log_aggr";
  } else if ('ip' in filter) {
    table="log_ip_aggr";
    values.push(filter['ip']);
    query += ' AND  ip = $'+ (values.length+add) +' ';
  } else { // user is not defined
    query += 'AND ip IS NULL ';
    table = "log_ip_aggr";
  }
  if('service_id' in filter) {
    values.push(filter['service_id']);
    query += ' AND service_id = $'+ (values.length+add) +' ';
  }
  return {
    query: query,
    values: values,
    table: table
  }
}

exports.getCountsByService = (startDate,endDate) => {
  logger.trace();
  return new promise((resolve, reject) => {
    const days_list = `
    with days as (
      select generate_series(
        date_trunc('day', timestamp $1),
        date_trunc('day', timestamp $2),
        '1 day'::interval
      ) as day
    ) `;
    db.any(
      days_list
      + `
      SELECT
        u.name,
        u.service_id,
        u.color,
        u.day,
        least(count(u.day),sum(u.uniq)) AS uniq,
        sum(u.uniq) as count
      FROM
        (
          SELECT
            s.name AS name,
            s.service_id AS service_id,
            s.color AS color,
            days.day AS day,
            count(l.line_number) AS uniq
          FROM
            days
            cross join services s
            left join log_file_entries l on date_trunc('day', l.time_local) = days.day AND s.service_id = l.service_id
          GROUP BY s.name, s.service_id, s.color, days.day, l.remote_addr
        ) AS u
      GROUP BY u.name, u.service_id, u.color, u.day`,
      [startDate,endDate])
        .then(data => {
            logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.trace();
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};


exports.getCounts = (startDate,duration,interval, filter = {}) => {
  logger.trace();
  const {query, values, table} = createFilter(filter);
  return new promise((resolve, reject) => {
    const days_list = `
    with intervals as (
      select generate_series(
        date_trunc('${interval}', timestamp $1),
        date_trunc('${interval}', timestamp $1 + interval '1 ${duration}' - interval '1 ${interval}'),
        '1 ${interval}'::interval
      ) as interval
    ) `;
    db.any(
      days_list
      + `
      SELECT
            intervals.interval AS interval,
            coalesce(la.cnt_requests,0) AS requests,
            coalesce(la.cnt_units,0) AS units,
            coalesce(la.cnt_body_bytes_sent,0) AS body_bytes_sent
          FROM
            intervals
            left join
              (SELECT *
                FROM ` + table +`
                WHERE period_level = '${interval}'::period_levels
                  `+query+`
                ) la
              ON la.period_start_date = intervals.interval
          GROUP BY intervals.interval, la.cnt_requests, la.cnt_units, la.cnt_body_bytes_sent
      ORDER BY interval ASC`,
      [startDate,...values])

        .then(data => {
            logger.trace();
            resolve(data); // data
        })
        .catch(error => {
          logger.trace();
          reject({
              state: 'failure',
              reason: 'Database error',
              extra: error
          });
        });
  });
};

