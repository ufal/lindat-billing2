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
  const {query, values} = createFilter(filter);
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
        count(l.line_number) AS count
      FROM
        days d
        CROSS JOIN services s
        LEFT JOIN
            (
              SELECT *, date_trunc('day',time_local) as day
              FROM log_file_entries

              WHERE time_local >= timestamp $1 - interval '$2 day'
                AND time_local < timestamp $1 + interval '1 day'
                 ` + query +`
            )  l
         ON l.service_id=s.service_id AND l.day=d.day
      GROUP BY name, s.service_id, color, d.day, d.ord
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


function createFilter(filter){
  var query="";
  var values=[];
  if('user_id' in filter) {
    //JOIN (SELECT service_id FROM service_pricing WHERE user_id=$2) p ON l.service_id = p.service_id
    query = ' AND  remote_addr IN (SELECT ip FROM user_endpoints WHERE user_id=$3 AND is_verified=TRUE) '; // TODO is_active !!!
    values.push(filter['user_id'])
  }
  return {
    query: query,
    values: values
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


exports.getCounts = (serviceId,startDate,duration,interval) => {
  logger.trace();
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
        u.name,
        u.color,
        u.interval,
        least(count(u.interval),sum(u.uniq)) AS users,
        sum(u.uniq) as requests
      FROM
        (
          SELECT
            s.name AS name,
            s.color AS color,
            intervals.interval AS interval,
            count(l.line_number) AS uniq
          FROM
            intervals
            cross join (SELECT * FROM services WHERE service_id = $2) s
            left join log_file_entries l on date_trunc('${interval}', l.time_local) = intervals.interval AND s.service_id = l.service_id
          GROUP BY s.name, s.color, intervals.interval, l.remote_addr
        ) AS u
      GROUP BY u.name, u.color, u.interval
      ORDER BY u.interval ASC`,
      [startDate,serviceId])
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


exports.getPricesCounts = (serviceId,startDate,duration,interval, userId) => {
  logger.trace();
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
        u.name,
        u.color,
        u.interval,
        u.price * u.units AS prices,
        u.units AS units,
        sum(u.uniq) as requests
      FROM
        (
          SELECT
            s.name AS name,
            s.color AS color,
            intervals.interval AS interval,
            count(l.line_number) AS uniq,
            coalesce(sum(l.unit),0) AS units,
            coalesce(sp.price, 0) AS price
          FROM
            intervals
            cross join (SELECT * FROM services WHERE service_id = $2) s
            left join
              (
                SELECT
                  fe.*
                FROM
                  log_file_entries fe
                  JOIN user_endpoints ue ON fe.remote_addr = ue.ip
                WHERE ue.user_id = $3
              )  l ON date_trunc('${interval}', l.time_local) = intervals.interval AND s.service_id = l.service_id
            LEFT OUTER JOIN service_pricing sp ON l.service_id = sp.service_id AND l.time_local >= sp.valid_from AND (sp.valid_till IS NULL OR l.time_local < sp.valid_till)
          GROUP BY s.name, s.color, intervals.interval, sp.price
        ) AS u
      GROUP BY u.name, u.color, u.interval, u.price, u.units
      ORDER BY u.interval ASC`,
      [startDate, serviceId, userId])
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
