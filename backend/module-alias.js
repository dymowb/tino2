const moduleAlias = require('module-alias');
const path = require('path');

const isDevelopment = process.env.NODE_ENV !== 'production';
const baseDir = isDevelopment ? 'src' : 'dist';

moduleAlias.addAliases({
  '@': path.join(__dirname, baseDir),
  '@config': path.join(__dirname, baseDir + '/config'),
  '@controllers': path.join(__dirname, baseDir + '/controllers'),
  '@middleware': path.join(__dirname, baseDir + '/middleware'),
  '@models': path.join(__dirname, baseDir + '/models'),
  '@routes': path.join(__dirname, baseDir + '/routes'),
  '@services': path.join(__dirname, baseDir + '/services'),
  '@utils': path.join(__dirname, baseDir + '/utils'),
  '@types': path.join(__dirname, baseDir + '/types')
});