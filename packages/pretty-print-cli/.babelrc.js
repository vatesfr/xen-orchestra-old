const { NODE_ENV = 'development' } = process.env
const __PROD__ = NODE_ENV === 'production'

module.exports = {
  comments: !__PROD__,
  compact: __PROD__,
  ignore: NODE_ENV === 'test' ? undefined : [ /\.spec\.js$/ ],
  plugins: ['lodash'],
  presets: [
    [
      'env',
      {
        debug: true,
        loose: true,
        shippedProposals: true,
        targets: {
          node: __PROD__ ? '6' : 'current'
        },
        useBuiltIns: 'usage'
      }
    ],
    'flow'
  ]
}
