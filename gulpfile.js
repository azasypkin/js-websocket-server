var gulp = require('gulp');
var fs = require('fs');
var browserify = require('browserify');
var babelify = require('babelify');

var browserifyOptions = {
  debug: true,
  standalone: 'FxOSWebSocket'
};

function onError(e) {
  console.log("Error: " + e.message);
}

gulp.task('compile', function() {
  return browserify(browserifyOptions)
    .transform(babelify)
    .require('./src/server.es6.js', { entry: true })
    // Exclude external event dispatcher lib non-standalone file
    .ignore('EventDispatcher')
    .bundle()
    .on('error', onError)
    .pipe(fs.createWriteStream('dist/fxos-websocket-server.js'));
});

gulp.task('compile-standalone', function() {
  return browserify(browserifyOptions)
    .transform(babelify)
    .require('./src/server.es6.js', { entry: true })
    .bundle()
    .on('error', onError)
    .pipe(fs.createWriteStream('dist/fxos-websocket-server-standalone.js'));
});

gulp.task('default', ['compile', 'compile-standalone'], function () {
  // Copy standalone variant to examples folder
  gulp.src('./dist/fxos-websocket-server-standalone.js').pipe(
      gulp.dest('./examples/ping-pong/js/lib/')
  );
});

