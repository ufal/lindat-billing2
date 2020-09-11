const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('../db');
const moment = require('moment');

exports.addService = (userId, name, desc, prefix, color) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.service.add(name, desc, prefix, color)
    .then(data => {
      db.user.logAction(userId, 'addService');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getServices = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.service.get()
    .then(data => {
      db.user.logAction(userId, 'listServices');
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
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getUser = (userId, id) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.user.getSingleUser(id)
    .then(data => {
      db.user.logAction(userId, 'userDetail');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};


exports.getPrices = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.pricing.get()
    .then(data => {
      db.user.logAction(userId, 'listPrices');
      for(var i=0; i < data.length; i++) {
        logger.log(i,data[i]['valid_from'])
        data[i]['valid_from'] = moment(data[i]['valid_from']).format('YYYY-MM-DD');
        if(data[i]['valid_till']) data[i]['valid_till'] = moment(data[i]['valid_till']).format('YYYY-MM-DD');
      }
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getPricing = (userId, id) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.pricing.getSinglePricing(id)
    .then(data => {
      db.user.logAction(userId, 'pricingDetail');
      data['valid_from'] = moment(data['valid_from']).format('YYYY-MM-DD');
      if(data['valid_till']) data['valid_till'] = moment(data['valid_till']).format('YYYY-MM-DD');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.addPricing = (userId, service_id, user_id, price, unit, valid_from, valid_till) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.pricing.add(service_id, user_id, price, unit, valid_from, valid_till)
    .then(data => {
      db.user.logAction(userId, 'addPricing');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};


exports.updatePricing = (userId, pricing_id, service_id, user_id, price, unit, valid_from, valid_till) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.pricing.update(pricing_id, service_id, user_id, price, unit, valid_from, valid_till)
    .then(data => {
      db.user.logAction(userId, 'updatePricing');
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};


exports.getMonthlyCountsByService = (date) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.getMonthlyCountsByService(date, {})
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getWeeklyCountsByService = (date) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.getWeeklyCountsByService(date, {})
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.getCountsByService = (startDate,endDate) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.getCountsByService(startDate, endDate)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};
exports.getLogFiles = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.get()
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
};

exports.tailLog = (fileId, tail) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.logs.setLogTail(fileId, tail)
    .then(data => {
      resolve(data);
    })
    .catch(err => {
      reject(err);
    });
  });
}