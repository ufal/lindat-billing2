const promise = require('bluebird');
const logger = require('../logger');
const db = require('../db');


exports.getCounts = (date, duration, interval, filter = {}) => {
  logger.trace();
  const startDate = date;
  return new promise((resolve, reject) => {
    db.logs.getCounts(startDate, duration, interval, filter)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getPeriodCounts = (date, duration, interval, datePath, filter = {}) => {
  logger.trace();
  return new promise((resolve, reject) => {
    exports.getCounts(date, duration, interval, filter)
    .then(data => {
      resolve({units: data2path('units', data, datePath), requests: data2path('requests', data, datePath), body_bytes_sent: data2path('body_bytes_sent', data, datePath)});
    })
    .catch(err => {
      reject(err);
    });
  });
};


exports.getServices = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.service.get()
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getService = (id) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.service.getSingleService(id)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getUsers = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.user.get()
    .then(data => {
      db.user.logAction(userId, 'listUsers');
      var clean_data = data.map(e => {
        delete e['verification_code'];
        delete e['password'];
        return e
      });
      resolve(clean_data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getTopIPs = ( userId,
                      filter={},
                      period_start = (new Date().getFullYear())+'-01-01 00:00:00',
                      period_end = (new Date().getFullYear() + 1)+'-01-01 00:00:00',
                      measure='units',
                      level='month',
                      min_exist = 8000
                    ) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.ip.getTop(filter,period_start,period_end,measure,level,min_exist)
    .then(data => {
      db.user.logAction(userId, 'listIPs');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getPricings = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.pricing.get()
    .then(data => {
      db.user.logAction(userId, 'listPricings');
      var table = data.map(pricing => ['pricing_id', 'service_name', 'user_name', 'price', 'valid_from', 'valid_till', 'user_id', 'is_active'].map(e => pricing[e]));
      resolve(table);
    })
    .catch(err => {
      reject(err);
    });
  });
};

function data2path(field, data, path){
  var result = {};
  var position = result;
  for(var i = 0; i < path.length; i++){
    position[path[i]] = {};
    position = position[path[i]];
  }
  position['total'] = data.map((currentValue, index, arr) => { return {cnt: currentValue[field], interval: currentValue['interval']}; })
  return result;
}