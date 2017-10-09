const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const fsExtra = require('fs-extra');

/**
 * Default Options
 * @type {Object}
 */
const DEFAULT_OPTIONS = {
  args: [],
  conf: './jsdoc.conf'
};

/**
 * Path that execute npm script
 * @type {String}
 */
const CWD = process.cwd();

/**
 * Temp file
 * @type {String}
 */
const TMP = path.resolve(CWD, `jsdoc.${Date.now()}.conf.tmp`);

/**
 * Read JSDoc configuration file
 * @param  {[type]} conf [description]
 * @return {[type]}      [description]
 */
function readConfFile (conf) {
  return new Promise(function (resolve, reject) {
    fsExtra.readJson(conf, function (err, obj) {
      if (err) {
        return reject(err);
      }

      const files = [];

      if (obj.source && obj.source.include) {
        console.log('Taking sources from config file');
      } else {
        compilation.chunks.forEach(function (chunk) {
          chunk.modules.forEach(function (module) {
            if (module.fileDependencies) {
              module.fileDependencies.forEach(function (filepath) {
                files.push(path.relative(CWD, filepath));
              });
            }
          });
        });

        Object.assign(obj.source, { include: files });
      }

      return resolve(fs.writeFileSync(TMP, JSON.stringify(obj)));
    });
  });
}

/**
 * Plugin
 * @param       {Object} translationOptions
 * @constructor
 */
function Plugin (translationOptions) {
  this.options = Object.assign({}, DEFAULT_OPTIONS, translationOptions);
}

/**
 * Apply
 * @param {Object} compiler
 */
Plugin.prototype.apply = function (compiler) {
  const self = this;
  const options = self.options;

  compiler.plugin('watch-run', function (watching, callback) {
    self.webpackIsWatching = true;
    callback(null, null);
  });

  compiler.plugin('emit', function (compilation, callback) {
    console.log('JSDOC Start generating');

    readConfFile(path.resolve(CWD, options.conf)).then(function () {
      const isWindows = /^win/.test(process.platform);
      const command = isWindows ? 'jsdoc.cmd' : 'jsdoc';
      const args = ['-c', TMP].concat(options.extraArgs);
      const jsdoc = spawn(CWD + '/node_modules/.bin/' + command, args);
      const jsdocErrors = [];

      jsdoc.stdout.on('data', function (data) {
        console.log(data.toString());
      });

      jsdoc.stderr.on('data', function (data) {
        jsdocErrors.push(data.toString());
      });

      jsdoc.on('close', function (data, code) {
        if(jsdocErrors.length > 0) {
          jsdocErrors.forEach(function (value) {
            console.error(value);
          });
        } else {
          console.log('JsDoc successful');
        }

        fs.unlink(TMP, function() {
          callback();
        });
      });
    });
  });

  compiler.plugin('done', function (stats) {
    console.log('JSDOC Finished generating');
    console.log('JSDOC TOTAL TIME:', stats.endTime - stats.startTime);
  });
};

module.exports = Plugin;
