var path = require('path');
var spawn = require('child_process').spawn;
var fse = require('fs-extra');
var _ = require('lodash');

/** @type {string} */
var PLUGIN_NAME = 'JsDocPlugin';

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
    preserveTmpFile: false,
    /**
     * Run JsDoc recursively (with -r flag).
     * @type {?boolean}
     */
    recursive: false
  };

  this.options = _.merge({}, defaultOptions, options);
}

Plugin.prototype.apply = function (compiler) {
  var self = this;
  var options = self.options;

  compiler.hooks.watchRun.tap(PLUGIN_NAME, function (watching) {
    self.webpackIsWatching = true;
  });

  compiler.hooks.emit.tapAsync(PLUGIN_NAME, function (compilation, callback) {
    var cwd = process.cwd();
    var givenDirectory = options.cwd;
    var preserveTmpFile = options.preserveTmpFile;
    var jsdocConfig = path.resolve(givenDirectory, options.conf);
    var jsdocConfigDir = path.dirname(jsdocConfig);
    var files = [], jsdocErrors = [];
    var obj = {};
    var jsdoc, cmd;
    var tmpFile;
    var jsdocArgs;

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
      /**
       * Pushes all filepaths included in the bundles (except any file from
       * node_modules, like the webpack ones) into `files`.
       * I.e:
       *     If you use the scripts "a", "b" and expect webpack to bundle them to "main",
       *     then the included files will be "a" and "b"...
       *     NOT "main" and/or any file from "node_modules".
       */
      compilation.fileDependencies.forEach(function (filepath, i) {
        var exception = /\/node_modules\//.test(filepath);

        if (!exception) {
          files.push(filepath);
        }
      });

      _.defaults(obj, {
        source: {
          include: files
        }
      });

      tmpFile = jsdocConfig + '.tmp';
      console.log('Writing temporary file at: ', tmpFile);
      fse.writeFileSync(tmpFile, JSON.stringify(obj));
      jsdocConfig = tmpFile;
    }

    console.log('Using jsdoc located at: ', cmd);
	
    jsdocArgs	= ['-c', jsdocConfig];
	
    if (options.recursive) {
      jsdocArgs.push('-r');
    }
	
    jsdoc = spawn(cmd, jsdocArgs, {
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

  compiler.hooks.done.tap(PLUGIN_NAME, function (stats) {
    console.log('JSDOC Finished generating');
    console.log('JSDOC TOTAL TIME:', stats.endTime - stats.startTime);
  });
};

module.exports = Plugin;
