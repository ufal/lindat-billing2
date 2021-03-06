const config = require('config');
const promise = require('bluebird');
const logger = require('../logger');
const pgp = require('pg-promise')(
    {
        promiseLib: promise,
        query: function (e) {
            logger.debug('QUERY:', pgp.as.format(e.query,e.params));
        }
});
const types = require('pg-types');
pgp.pg.types.setTypeParser(types.builtins.INT8, parseInt);
//pgp.pg.types.setTypeParser(20, parseInt);

// Database connection details;
let db = pgp(config.db);

db.connect()
    .then(obj => {
      logger.trace();
      obj.done(); // release the connection
    })
    .catch(error => {
      logger.trace();
      logger.error('Error connecting to database [%s:%s]:', config.db.host, config.db.port, error);
});

module.exports = db;