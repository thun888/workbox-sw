const path = require('path');

module.exports = {
  entry: './src/sw-source.js',
  output: {
    filename: 'sw.js',
    path: path.resolve(__dirname, 'dist'),
  },
  mode: 'production',
  target: 'webworker',
  optimization: {
    minimize: true,
  },
};
