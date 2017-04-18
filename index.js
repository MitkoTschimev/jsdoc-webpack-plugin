'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash/merge');
var spawn = require('child_process').spawn;
var fsExtra = require('fs-extra');

function Plugin(translationOptions) {
  var defaultOptions = {
    conf: './jsdoc.conf'
  };

  this.options = merge({}, defaultOptions, translationOptions);
}

/**
 * Spawns a jsdoc process.
 * It will look for the binary in the basePath passed.
 * @param  {String} basePath - the basepath
 * @param  {Object} obj      - config object
 * @return {Promise} with an array of errors, if any
 */
function spawnJsDoc (basePath, obj) {
  return new Promise((resolve, reject) => {
    var jsdocErrors = [];
    var spawnErr = false;
    var cwd = process.cwd();
    var jsDocConfTmp = path.resolve(cwd, 'jsdoc.' + Date.now() + '.conf.tmp');
    var command = /^win/.test(process.platform) ? 'jsdoc.cmd' : 'jsdoc';
    var jsdoc;

    fs.writeFileSync(jsDocConfTmp, JSON.stringify(obj));

    if (typeof basePath === 'string') {
      jsdoc = spawn(path.resolve(basePath, command), ['-c', jsDocConfTmp])
    } else {
      jsdoc = spawn('jsdoc', ['-c', jsDocConfTmp])
    }

    jsdoc.on('error', (err) => {
      spawnErr = err;
    });
    jsdoc.stderr.on('data', function (data) {
      jsdocErrors.push(data.toString());
    });
    jsdoc.on('close', function (data, code) {
      jsdocErrors = jsdocErrors.join('\n').split('\n').filter((item) => { return item !== ''; });
      jsdocErrors.forEach((message, index, list) => {
        list[index] = new Error(message);
      });
      fs.unlink(jsDocConfTmp, function (err) {
        if (err) return reject(err);
        if (spawnErr) return reject(spawnErr);
        resolve(jsdocErrors);
      });
    });
  });
}

Plugin.prototype.apply = function (compiler) {
  var self = this;
  var options = self.options;

  compiler.plugin('watch-run', function (watching, callback) {
    self.webpackIsWatching = true;
    callback(null, null);
  });

  compiler.plugin('emit', function (compilation, callback) {
    console.log('JSDOC Start generating');

    fsExtra.readJson(path.resolve(process.cwd(), options.conf), function (err, obj) {
      var files = [];
      if(err) {
        callback(err);
        return;
      }

      if (obj.source && obj.source.include) {
        console.log('Taking sources from config file');
      } else {
        compilation.chunks.forEach(function (chunk) {
          chunk.modules.forEach(function (module) {
            if (module.fileDependencies) {
              module.fileDependencies.forEach(function (filepath) {
                files.push(path.relative(process.cwd(), filepath));
              });
            }
          });
        });
        merge(obj.source, { include: files });
      }

      /**
       * First try to spawn the jsdoc command from `node_modules/jsdoc-webpack-plugin/node_modules/.bin` path
       */
      spawnJsDoc(`${__dirname}/node_modules/.bin/`, obj).then((errs) => {
        if (errs && errs.length > 0) compilation.errors = compilation.errors.concat(errs);
        callback();
      }).catch((err) => {
        if (err.code === "ENOENT") {
            /**
             * Finally try to let node find it
             */
            return spawnJsDoc(null, obj);
        } else {
          return Promise.reject(err);
        }
      }).then((errs) => {
        if (errs && errs.length > 0) compilation.errors = compilation.errors.concat(errs);
        callback();
      }).catch((err) => {
        if (err.code === "ENOENT") {
          compilation.errors.push(new Error('JSDOC not found.'))
        } else {
          compilation.errors.push(err);
        }
        callback();
      });

    });
  });

};

module.exports = Plugin;
