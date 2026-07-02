const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    port: 9111,
    historyApiFallback: true,
    hot: true,
    proxy: [
      {
        context: ['/api/k8s'],
        target: 'https://localhost:8843',
        secure: false,
        changeOrigin: true,
      },
    ],
  },
});
