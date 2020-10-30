const promise = require('bluebird');
const fs = promise.promisifyAll(require('fs'));
const config = require('config');
const path = require("path");
const nth = require("node-nthline");
const md5 = require('md5')
const lineByLine = require("n-readlines");
const db = require("../db");
const logger = require('../logger');
const _ = require('underscore');


const parser = require('nginx-log-parser')('$remote_addr - $remote_user [$time_local] '
    + '"$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"');

var services = {};

filesChangesMonitor = async (dir) => {
  fs.watch(dir, (event,file) => {
    // if(event == 'rename'){} // new file or file rename (implemented in change)
    if(event == 'change'){
      try {
        services = {};
        db.service.get()
          .then(data => {
            for(i in data) {
              services[data[i].service_id] = data[i].prefix;
            }
            logger.debug(services);
        });
      } catch(err) {
        logger.error(err);
        return;
      }
      readFile(dir + "/" + file);
    }
  });
}

readFiles = async (dir) => {
  try {
    await db.service.get()
      .then(data => {
        for(i in data) {
          services[data[i].service_id] = data[i].prefix;
        }
        logger.debug(services);
      });
  } catch(err) {
    logger.error(err);
    return;
  }
  fs.readdirAsync(dir)
    .then(async (files) => {
      logger.trace();
      logger.debug(files);
      for(const file of files){
        await readFile(dir + "/" + file);
      };
      logger.trace();
  })
  .catch(err => {
    logger.trace();
    logger.error(err);
  })
};

readFile = async (file) => {
  logger.trace();
  let fileName = path.basename(file);
  if (fs.statSync(file).size === 0) {
    return;
  }
  var firstLine = await nth(1, file);
  var firstLineChecksum = md5(firstLine);
  var from = 1;
  try {
    var logFile = await db.logs.getLogFile(fileName, firstLineChecksum);
    from = logFile.lines_read + 1;
  }catch(err){
    var logFile = await db.logs.addLogFile(fileName, firstLineChecksum, true).catch(err => {throw err;});
  }
  logger.debug('File ID = ' + logFile.file_id);
  await readLines(logFile.file_id, file, from);
  logger.debug(logFile);
};

readLines = async (fileId, file, from) => {
  const liner = new lineByLine(file);
  let line;
  for(var ln=1;ln<from;ln++){
    liner.next();
  }
  while (line = liner.next()) {
    line = line.toString('utf8');
    var lineChecksum = md5(line);
    let obj = parseLogLine(line);
    obj.file_id = fileId;
    var ignore = new RegExp(config.logs.ignore);
    if(obj.status && obj.status.startsWith('2') && !ignore.test(obj.request)) {
      obj.line_number = ln;
      obj.line_checksum = lineChecksum;
      let serviceId = 0;
      for(s in services) {
        if(s==0) continue;
        let prefix = services[s];
        var re = new RegExp(prefix);
        if(re.test(obj.request)){
          serviceId = s;
          break;
        }
      }
      if(serviceId==0) {
        let prefix = services[0];
        var re = new RegExp(prefix);
        if(!re.test(obj.request)){
          ln++;
          continue;
        }
      }
      obj.service_id = serviceId;
      try{
        var logLine = await db.logs.checkLogEntry(obj);
      }catch(err){
        await db.logs.addLogEntries(obj);
      }
    }
    ln++;
  }
};

parseLogLine = (line) => {
  let obj = parser(line.replace(/\s\s+/g, ' '));
  _.defaults(obj, {unit: 1, body_bytes_sent: 0, request: '   '});
  let req = obj.request;
  req = req.replace(/^"(.+(?="$))"$/, '$1').split(' ');
  obj.method = req[0];
  obj.request = req[1];
  obj.protocol = req[2];
  obj.time_local = obj.time_local.replace(/[\[\]]/g, '');
  return obj;
};

readAndMonitorFiles = async (dir) => {
  await readFiles(dir);
  filesChangesMonitor(dir);
};

module.exports = { filesChangesMonitor, readFiles, readFile, readAndMonitorFiles };