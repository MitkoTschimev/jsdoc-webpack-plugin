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

Plugin.prototype.apply = function (compiler) {
  var self = this;
  var options = self.options;

  compiler.hooks.afterCompile.tapAsync('JsDoc Webpack Plugin', function (compilation, callback) {
    console.log('JSDOC Start generating');
    const startTime = new Date();

    fsExtra.readJson(path.resolve(process.cwd(), options.conf), function (err, obj) {
      var files = new Set(), jsdocErrors = [];
      var jsdoc, cwd = process.cwd();

      if(err) {
        callback(err);
        return;
      }

      if (obj.source && obj.source.include) {
        console.log('Taking sources from config file');
      } else {
        obj.source = obj.source || {};

        function pushDependencies(module) {
          if (module && !files.has(module.resource)) {
            files.add(module.resource);
            module.dependencies
              .map(dep => dep.module)
              .forEach(pushDependencies);
          }
        }
        compilation.chunks.forEach(chunk => pushDependencies(chunk.entryModule));
        merge(obj.source, { include: Array.from(files) });
      }

      var jsDocConfTmp = path.resolve(cwd, 'jsdoc.' + Date.now() + '.conf.tmp');
      fs.writeFileSync(jsDocConfTmp, JSON.stringify(obj));

        if(/^win/.test(process.platform))
            jsdoc = spawn(path.resolve(cwd) + '/node_modules/.bin/jsdoc.cmd', ['-c', jsDocConfTmp]);
        else
            jsdoc = spawn(__dirname + '/node_modules/.bin/jsdoc', ['-c', jsDocConfTmp]);

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
        fs.unlink(jsDocConfTmp, function() {
          console.log('JSDOC Finished generating');
          console.log('JSDOC TOTAL TIME:', new Date() - startTime);
          callback();
        });
      });
    });
  });

};

module.exports = Plugin;
