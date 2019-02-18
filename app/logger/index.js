const config = require('config');

const logger = require('tracer')
    .colorConsole(
        {
          level : config.logger.level || 'trace',
          format : [
              "{{timestamp}} <{{title}}> {{file}}:{{line}} {{message}}",
              {
                trace : "{{timestamp}} <{{title}}> {{file}}:{{line}} {{method}} {{message}}"
              } ],
          dateformat : "HH:MM:ss.L"
        });

module.exports = logger;