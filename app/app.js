/**
 * The core taking care of routing.
 */

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session')
const cookeParser =  require('cookie-parser');
const methodOverride = require('method-override');
const logger = require('./logger');
const config = require('config');
const routes = require('./routes');
const logManager = require('./log-manager/importLogs')
//const cors = require('cors');

const app = express();

/*var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', 'example.com');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}
app.use(allowCrossDomain);*/

app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : true}));

app.use(methodOverride('_method'));

app.set('view engine', 'pug');
app.set('views', __dirname + '/views');

// uncomment after placing your favicon in /public
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
// app.use(cookieParser());


if(config.logs.import_on_startup) {
  logManager.filesChangesMonitor(config.logs.path);
  // logManager.readFiles(config.logs.path);
}

app.use(cookeParser());

app.use(session(
  {
    secret: config.jwt.secret,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 60 * 10000 }
  })
);
app.use(routes);

module.exports = app;