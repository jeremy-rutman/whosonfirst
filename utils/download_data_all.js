const child_process = require('child_process');
const async = require('async');
const fs = require('fs-extra');
const os = require('os');
const url = require('url');
const path = require('path');

const bundles = require('../src/bundleList');
const config = require( 'pelias-config' ).generate(require('../schema'));

const wofDataHost = config.get('imports.whosonfirst.dataHost') || 'https://dist.whosonfirst.org';

function download(callback) {
  //ensure required directory structure exists
  fs.ensureDirSync(path.join(config.imports.whosonfirst.datapath, 'meta'));

  // download one bundle for every other CPU (tar and bzip2 can both max out one core)
  // (the maximum is configurable, to keep things from getting too intense, and defaults to 4)
  //lower this number to make the downloader more CPU friendly
  //raise this number to (possibly) make it faster
  const maxSimultaneousDownloads = config.get('imports.whosonfirst.maxDownloads') || 4;
  const cpuCount = os.cpus().length;
  const simultaneousDownloads = Math.max(maxSimultaneousDownloads, Math.min(1, cpuCount / 2));

  // generate a shell command that does the following:
  // 1.) use wget to download the bundle, not piping directly to tar (which would avoid the
  //     need for intermediate storage of the archive file but seems to cause timouts)
  // 2.) extract the archive so that the data directory goes in the right place and
  //     the README file is ignored (it just would get overridden by subsequent bundles)
  // 3.) remove the tar file
  // 4.) move the meta file to the meta files directory

  function generateCommand(bundle, directory) {
    const csvFilename = bundle.replace(/-\d{8}T\d{6}-/, '-latest-') // support timestamped downloads
                              .replace('.tar.bz2', '.csv');

//    return `curl -s ${wofDataHost}/bundles/${bundle} | tar -xj --strip-components=1 --exclude=README.txt -C ` +
//      `${directory} && mv ${path.join(directory, csvFilename)} ${path.join(directory, 'meta')}`;


     var command=`wget -q ${wofDataHost}/bundles/${bundle} && tar -xj --strip-components=1 --exclude=README.txt -C ` +
        `${directory} -f ${bundle} && rm ${bundle} && mv ${path.join(directory, csvFilename)} ${path.join(directory, 'meta')}`;
     console.log(command);
     return command;

  }

  bundles.generateBundleList((err, bundlesToDownload) => {
    if (err) {
      throw new Error(err.message);
    }

    const downloadFunctions = bundlesToDownload.map(function (type) {
      return function downloadABundle(callback) {
        const cmd = generateCommand(type, config.imports.whosonfirst.datapath);
        console.log('Downloading ' + type + ' bundle');
        child_process.exec(cmd, function commandCallback(error, stdout, stderr) {
          console.log('done downloading ' + type + ' bundle');
          if (error) {
            console.error('error downloading ' + type + ' bundle: ' + error);
            console.log(stderr);
          }
          callback();
        });
      };
    });

    async.parallelLimit(downloadFunctions, simultaneousDownloads, callback);
  });
}

module.exports.download = download;
