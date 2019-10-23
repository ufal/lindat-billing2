const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');

exports.logAction = (userId, action) => {
  logger.trace();
  db.any('INSERT INTO user_logs(user_id, action) VALUES($1, $2)', [userId, action])
      .catch(error => {
        logger.trace();
        logger.error('user_logs ERROR\n', error);
      });
};

exports.authenticate = (email, password) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('SELECT user_id, email, first_name, last_name, organization, is_admin FROM users WHERE email = $1 AND password = crypt($2, password) AND is_active=TRUE AND is_verified=TRUE',
        [email.toLowerCase(), password])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else reject({
              state: 'failure',
              reason: 'Invalid username or password',
              extra: null
          });
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

exports.register = (email, password, fname, lname, org) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('INSERT INTO users(email, password, first_name, last_name, organization) VALUES($1, crypt($2, gen_salt(\'bf\')), $3, $4, $5) RETURNING user_id, verification_code',
        [email.toLowerCase(), password, fname, lname, org])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No user_id returned',
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

exports.verifyAccount = (email, code) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('UPDATE users SET is_verified=TRUE, is_active=TRUE, verification_code=NULL WHERE email=$1 AND verification_code=$2 RETURNING user_id', [email, code])
    .then(data => {
      if (data) {
        resolve(data);
      } else {
        reject({
          state: 'failure',
          reason: 'Invalid Verification Code',
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

exports.lastLogin = (id) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('select max(create_time) from user_logs where action=login and user_id=$1', [id])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No login date for user_id returned',
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
    db.any('SELECT * FROM users')
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No users returned',
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

exports.getSingleUser = (id) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.one('SELECT * FROM users WHERE user_id = $1',[id])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No user with given user_id',
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