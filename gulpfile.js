var gulp = require('gulp');
var colors = require('gulp-util').colors;

var DEST = process.env.NODE_ENV === 'production' ? './.tmp' : './.dist';

// handler all errors
var errorHandler = function(err) {
  console.log(colors.red('ERROR: ') + colors.yellow(err.plugin) + colors.red(' =>'), err.message);
  this.emit('end');
};


// user configs
var config = require('./config');


// build jade to html
var jade = require('gulp-jade');
var jadePath = ['./article/**/*.jade', './theme/**/404.jade', './theme/**/500.jade'];
gulp.task('template', function() {
  return gulp.src(jadePath, { base: './' })
    .pipe(jade({ locals: config }))
    .on('error', errorHandler)
    .pipe(gulp.dest(DEST));
});


// load js with babel loader
var jsPath = ['./article/**/*.js', './theme/**/*.js'];
var uglify = require('gulp-uglify');
var babelify = require('babelify');
var browserify = require('browserify');
var glob = require('glob');
var source = require('vinyl-source-stream')
var files = [];

jsPath.forEach(function(sec) {
  files = files.concat(glob.sync(sec));
});

gulp.task('js', function () {
  files.forEach(function(dir) {
    var path = dir.slice(1).split('/');
    var dest = path.slice(0, -1).join('/');
    var name = path.pop();

    browserify({ entries: dir, debug: true })
      .transform(babelify)
      .bundle()
      .pipe(source(name))
      .on('error', errorHandler)
      .pipe(gulp.dest(DEST.slice(2) + dest));
  });
});


// load css with cssnext
var cssPath = ['./article/**/*.css', './theme/**/*.css'];
var cssnext = require('gulp-cssnext');
gulp.task('css', function () {
  return gulp.src(cssPath, { base: './' })
    .pipe(cssnext({
      browsers: ['ie > 8', 'chrome > 26', 'Firefox ESR'],
      plugins: [ require('postcss-nested')],
      import: {
        path: 'theme/default/css'
      }
    }))
    .on('error', errorHandler)
    .pipe(gulp.dest(DEST));
});


// js lint with jshint
var jshint = require('gulp-jshint');
gulp.task('lint', function() {
  return gulp.src(jsPath)
    .pipe(jshint({ esnext: true }));
});


// image compress
var imgPath = ['./article/**/*.@(gif|jpg|svg|png)', './theme/**/*.@(gif|jpg|svg|png)'];
var imageop = require('gulp-image-optimization');
gulp.task('image', function(cb) {
  gulp.src(imgPath, {base: './' }).pipe(imageop({
    optimizationLevel: 5,
    progressive: true,
    interlaced: true
  }))
  .pipe(gulp.dest(DEST)).on('end', cb).on('error', cb);
});

// build api from html files
var fs = require('fs');
var reg = {
  title: /<title>([^<]+)<\/title>/,
  description: /<meta name="description"[^=]+="([^"]+)"/
};

gulp.task('api', ['template'], function() {
  gulp.src(DEST + '/article/**/index.html', function(err, files) {
    if(err || !files.length) return;
    var articles = [];
    var dist = DEST.slice(2);

    files.forEach(function(file) {
      var text = fs.readFileSync(file, 'utf-8');

      // git 不存文件的生成 / 更新时间
      var realPath = file.replace(dist, '').replace(/\.html$/, '.jade');
      var shStr = `git log '${realPath}' | awk 'BEGIN { i = 0 } /^Date:/ { last = $0; i++; if(i > 0) first = $0 } END { print first,last }'`;
      var exec = require('child_process').execSync;
      var times = exec(shStr, { encoding: 'utf-8' }).split('Date:').reduce(function(ret, date) {
        if(date) ret.push(date.trim());
        return ret;
      }, []);

      // remove '\n' that generated by gulp-jade
      // FUCK gulp-jade
      fs.writeFileSync(file, text.replace(/[\n]/gm, ''));

      articles.push({
         title: reg.title.exec(text)[1],
         description: reg.description.exec(text)[1],
         createdAt: times[1],
         updatedAt: times[0],
         url: '/' + file.split('/').slice(-2, -1)
      });
    });

    // sort articles by birthtime
    articles.sort(function(a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    var dir = files[1].split(dist).slice(0, 1) + dist + '/api';
    if(!fs.existsSync(dir)) {
      var mkdirp = require('mkdirp');
      mkdirp.sync(dir);
    }
    fs.writeFileSync(dir + '/article.json', JSON.stringify(articles));
  }).on('error', errorHandler);
})

// clean .dist dir
var clean = require('gulp-clean');
gulp.task('clean', function () {
  return gulp.src(['.dist', '.tmp'], { read: false })
    .pipe(clean());
});

// watcher for development
gulp.task('dev', ['js', 'css', 'image', 'api'], function() {

  gulp.watch(jsPath, ['js', 'lint']);
  gulp.watch(cssPath, ['css']);
  gulp.watch(imgPath, ['image']);

  // watch jade file in `theme/`, but dont convert it to html
  gulp.watch(jadePath.concat('./theme/**/*.jade'), ['api']);
});


// build for production
gulp.task('dist', ['api', 'js', 'css', 'image']);
