var gulp = require('gulp');
var fs = require('fs');
var browserify = require('browserify');
var babelify = require('babelify');

gulp.task('default', function () {
  var bundle = browserify({
    debug: false,
    standalone: 'FxOSWebSocket'
  })
    .transform(babelify)
    .require("./src/server.es6.js", { entry: true })
    .bundle()
    .on('error', function (err) { console.log("Error: " + err.message); });

  bundle.pipe(fs.createWriteStream("dist/fxos-websocket-server.js"));

  // Write to examples
  bundle.pipe(
    fs.createWriteStream("examples/ping-pong/js/lib/fxos-websocket-server.js")
  );
});

