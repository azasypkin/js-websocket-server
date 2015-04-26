var gulp = require('gulp');
var fs = require('fs');
var browserify = require('browserify');
var babelify = require('babelify');

gulp.task('default', function () {
  var browserifyOptions = {
    debug: true,
    standalone: 'FxOSWebSocket'
  };

  function onError(e) {
    console.log("Error: " + e.message);
  }

  [
    "fxos-websocket-server.js",
    "fxos-websocket-server-standalone.js"
  ].forEach(function(name) {
    browserify(browserifyOptions)
      .transform(babelify)
      .require("./src/server.es6.js", { entry: true })
      // Exclude external event dispatcher lib non-standalone file
      .ignore(name.indexOf('standalone') < 0 ? 'event-dispatcher-js' : '')
      .bundle()
      .on('error', onError)
      .pipe(fs.createWriteStream('dist/' + name));
  });

  // Copy standalone variant to examples folder
  gulp.src('./dist/fxos-websocket-server-standalone.js').pipe(
    gulp.dest('./examples/ping-pong/js/lib/')
  );
});

