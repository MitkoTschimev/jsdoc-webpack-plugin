var path = require('path');
var spawn = require('child_process').spawn;
var fse = require('fs-extra');
var _ = require('lodash');

/** @type {boolean} */
var isWindows = /^win/.test(process.platform);

/**
 * Ordered paths to the jsdoc command.
 *
 * @type {string[]}
 * @const
 */
var JSDOC_FILES = isWindows ? [
  'node_modules/.bin/jsdoc.cmd'
] : [
  'node_modules/.bin/jsdoc',
  'node_modules/jsdoc/jsdoc.js'
];

/**
 * Looks up for an existing file in each directory.
 *
 * @param {string|string[]} [files=[files]] - Filenames in order.
 * @param {string|string[]} [dirs=[dirs]] - Directories in order.
 * @returns {?string} The first found file or `null` if nothing is found.
 */
var lookupFile = function (files, dirs) {
  var found = null;

  [].concat(files).some(function (filename) {
    return [].concat(dirs).some(function (dirname) {
      var file = path.resolve(path.join(dirname, filename));

      if (fse.existsSync(file)) {
        return found = file;
      }
    });
  });

  return found;
};

/**
 * Reads the jsdoc config file (synchronously) allowing the use of CommonJS
 * modules or JSON documents as input.
 *
 * @param {string} filepath - The filepath to read from.
 * @throws If the file does not exist or is malformed.
 * @return {object} The exported value.
 */
var readConfigFile = function (filepath) {
  delete require.cache[filepath];
  return require(filepath);
};

function Plugin(options) {
  var defaultOptions = {
    /**
     * Default name for the config file.
     * A relative path to "cwd" is expected.
     * @type {?string}
     */
    conf: 'jsdoc.conf.js',
    /**
     * Default path for command and file lookup.
     * @type {?string}
     */
    cwd: '.',
    /**
     * This option applies only if a config file is not found.
     * By default, the temp file is removed after the compilation
     * is done, but you can set this option to a truthy value to
     * change it.
     * @type {?boolean}
     */
    preserveTmpFile: false
  };

  this.options = _.merge({}, defaultOptions, options);
}

Plugin.prototype.apply = function (compiler) {
  var self = this;
  var options = self.options;

  compiler.plugin('watch-run', function (watching, callback) {
    self.webpackIsWatching = true;
    callback(null, null);
  });

  compiler.plugin('emit', function (compilation, callback) {
    var cwd = process.cwd();
    var givenDirectory = options.cwd;
    var preserveTmpFile = options.preserveTmpFile;
    var jsdocConfig = path.resolve(givenDirectory, options.conf);
    var jsdocConfigDir = path.dirname(jsdocConfig);
    var files = [], jsdocErrors = [];
    var obj = {};
    var jsdoc, cmd;
    var tmpFile;

    console.log('JSDOC Start generating');

    cmd = lookupFile(JSDOC_FILES, [
      // 1. Where the config lives.
      jsdocConfigDir,
      // 2. In the given directory.
      givenDirectory,
      // 3. Where it was called.
      cwd,
      // 4. Here.
      __dirname
    ]);

    if (!cmd) {
      callback(new Error('jsdoc was not found.'));
      return;
    }

    if (fse.existsSync(jsdocConfig)) {
      try {
        obj = readConfigFile(jsdocConfig);
      } catch (exception) {
        callback(exception);
        return;
      }
    }

    if (obj.source && obj.source.include) {
      console.log('Taking sources from config file');
    }
    else {
      compilation.chunks.forEach(function (chunk) {
        chunk.modules.forEach(function (module) {
          if (module.fileDependencies) {
            module.fileDependencies.forEach(function (filepath) {
              files.push(path.relative(process.cwd(), filepath));
            });
          }
        });
      });
      _.merge(obj.source, { include: files });

      tmpFile = jsdocConfig + '.tmp';
      console.log('Writing temporary file at: ', tmpFile);
      fse.writeFileSync(tmpFile, JSON.stringify(obj));
      jsdocConfig = tmpFile;
    }

    console.log('Using jsdoc located at: ', cmd);
    jsdoc = spawn(cmd, ['-c', jsdocConfig], {
      cwd: jsdocConfigDir
    });

    jsdoc.stdout.on('data', function (data) {
      console.log(data.toString());
    });

    jsdoc.stderr.on('data', function (data) {
      jsdocErrors.push(data.toString());
    });

    jsdoc.on('close', function (code) {
      if (tmpFile && !preserveTmpFile) {
        console.log('Removing the temporary file');
        fse.unlinkSync(tmpFile);
        tmpFile = null;
      }

      if(jsdocErrors.length > 0) {
        jsdocErrors.forEach(function (value) {
          console.error(value);
        });
        callback(new Error('JsDoc exited with code ' + code));
      } else {
        console.log('JsDoc successful');
        callback();
      }
    });
  });

  compiler.plugin('done', function (stats) {
    console.log('JSDOC Finished generating');
    console.log('JSDOC TOTAL TIME:', stats.endTime - stats.startTime);
  });
};

module.exports = Plugin;
