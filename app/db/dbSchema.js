const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const db = require('./connection');


const currentSchemaVersion = 2;     // keep it updated !!!
const minimalRequiredVersion = 2;   // keep it updated !!!

exports.dbVersion = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    db.any('SELECT COALESCE(max(version),0) AS current FROM db_schema_version')
        .then(data => {
            logger.trace("DATA",data);
            resolve({current: data[0]['current'], expected: currentSchemaVersion, required: minimalRequiredVersion}); // data
        })
        .catch(error => {
          logger.trace(error);
          process.exit();
        });
  });
};


exports.checkVersion = () => {
  logger.trace();
  return new promise((resolve, reject) => {
    module.exports.dbVersion().then(data => {
            logger.trace(data);
            resolve(data['current'] >= minimalRequiredVersion);
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
}