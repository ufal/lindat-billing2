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
logger.info('Connecting to database [%s:%s]: DB: %s, USER %s',config.db.host, config.db.port, config.db.database, config.db.user);
db.connect()
    .then(obj => {
      logger.trace();
      obj.done(); // release the connection
    })
    .catch(error => {
      logger.trace();
      logger.error('Error connecting to database [%s:%s]:', config.db.host, config.db.port, error);
});

async function testConnection() {
    const c = await db.connect(); // try to connect
    c.done(); // success, release connection
    logger.info("database connection test: OK");
    return c.client.serverVersion; // return server version
}

testConnection();
module.exports = db;