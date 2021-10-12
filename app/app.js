/**
 * The core taking care of routing.
 */

const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session')
const cookeParser =  require('cookie-parser');
const methodOverride = require('method-override');
const logger = require('./logger');
const config = require('config');
const routes = require('./routes');
const logManager = require('./log-manager/importLogs');
const db = require('./db');
//const cors = require('cors');


db.dbSchema.checkVersion().then(valid => {
  if(! valid){
    db.dbSchema.dbVersion().then(ver => {
      logger.error("DATABASE VERSION IS NOT VALID!!! current db: " + ver['current']
         + ", expected: " + ver['expected']
         + ", minimal: " + ver['required']);
      process.exit()
    });
  }
})

const app = express();

if(!config.has('jwt.secret')){logger.error('Please set jwt.secret in your local.json file');}

/*var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', 'example.com');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}
app.use(allowCrossDomain);*/

const base_url = config.has('server.base_url') ? config.server.base_url : '/';
const server_url = config.server.host + (config.has('server.port') ? ':' + config.server.port : '');

if(base_url.match(/.*(?<!\/)$/)){logger.error('POSSIBLE ROUTING PROBLEM: server.base_url should end with "/"');}

app.locals.baseUrl = base_url;
app.locals.serverUrl = server_url;

app.set('base', base_url);

app.use(base_url, express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : true}));

app.use(methodOverride('_method'));

app.set('view engine', 'pug');
app.set('views', __dirname + '/views');

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.png')));
app.use(favicon(path.join(__dirname, 'public', 'favicon.svg')));
// app.use(cookieParser());

/*
if(config.logs.add_services_if_not_exist && Array.isArray(config.logs.new_service_list)) {
  config.logs.new_service_list.forEach(
    service => {
      db.service.exists(service[0]).then( exists => {
          if(! exists) {
            db.service.add(...service).then(())=>{logger.debug("new service imported")};
          }
        })
        .catch(err => {
          logger.trace();
          logger.error(err);
        })
    }
  );
}
*/
async function loadNewServices (new_service_list) {
  logger.trace();
  await Promise.all(new_service_list.map(async (service) => {
    await db.service.exists(service[0]).then( exists => {
          if(! exists) {
            db.service.add(...service).then(()=>{logger.debug("new service imported")});
          }
        })
        .catch(err => {
          logger.trace();
          logger.error(err);
        })
  }));
}


loadNewServices(
  config.logs.add_services_if_not_exist && Array.isArray(config.logs.new_service_list)
  ? config.logs.new_service_list
  : [] ).then(() => {
    logger.debug("starting import log entries");
    if(config.logs.import_on_startup) {
      logManager.readAndMonitorFiles(config.logs.path);
    } else {
      logManager.filesChangesMonitor(config.logs.path);
    }
    });

app.use(cookeParser());

app.use(session(
  {
    secret: config.jwt.secret,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 10000 }
  })
);


app.use(base_url, routes);

module.exports = app;