const promise = require('bluebird');
const logger = require('../logger');
const db = require('../db');


exports.getCounts = (serviceId, date, duration, interval) => {
  logger.trace();
  const startDate = date;
  return new promise((resolve, reject) => {
    db.logs.getCounts(serviceId, startDate, duration, interval)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getPeriodCounts = (serviceId, date, duration, interval, datePath) => {
  logger.trace();
  return new promise((resolve, reject) => {
    exports.getCounts(serviceId, date, duration, interval)
    .then(data => {
      resolve({users: data2path('users', data, datePath), requests: data2path('requests', data, datePath)});
    })
    .catch(err => {
      reject(err);
    });
  });
};


exports.getPeriodPrices = (serviceId, date, duration, interval, datePath, userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.getPricesCounts(serviceId, date, duration, interval, userId)
    .then(data => {
      resolve({prices: data2path('prices', data, datePath), requests: data2path('requests', data, datePath)});
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