const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');
const crypto = require('crypto');



exports.add = (userId, name, start_date = null, end_date = null, token = null) => {
  logger.trace();
  console.log('Generate and show new token');
  return new promise((resolve, reject) => {
    crypto.subtle.generateKey( {name: "AES-GCM",length: 256},true,["encrypt", "decrypt"])
      .then( k => {
        console.log(k);
        return crypto.subtle.exportKey("jwk", k)
      })
      .then(jwk => {
          var token=jwk.k;
          return db.one('INSERT INTO user_tokens(user_id, name, token, start_date, end_date) VALUES($1, $2, $3, $4, $5) RETURNING token_id',
            [userId, name, token, start_date, end_date || null])
      })
      .then(data => {
              logger.trace();
              if (data) {
                resolve(data); // data
              }
              else {
                reject({
                  state: 'failure',
                  reason: 'No token_id returned',
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
    })

};


exports.get = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any('SELECT * FROM user_tokens')
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No tokens returned',
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

exports.get = (userId) => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any('SELECT * FROM user_tokens WHERE user_id=$1', [userId])
        .then(data => {
          logger.trace();
          if (data) {
              resolve(data); // data
          }
          else {
            reject({
              state: 'failure',
              reason: 'No tokens returned',
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
