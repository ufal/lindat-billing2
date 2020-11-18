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
      resolve({units: data2path('units', data, datePath), requests: data2path('requests', data, datePath)});
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
      resolve({units: data2path('units', data, datePath), prices: data2path('prices', data, datePath), requests: data2path('requests', data, datePath)});
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
      var table = data.map(usr => ['user_id', 'email', 'first_name', 'last_name', 'organization', 'is_admin'].map(e => usr[e]));
      resolve(table);
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