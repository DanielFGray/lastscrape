module.exports = {
  extends: 'airbnb-base',
  rules: {
    semi: [ 'error', 'never' ],
    'no-unexpected-multiline': [ 'error' ],
    'array-bracket-spacing': [ 'error', 'always' ],
    'no-console': 'off',
    'no-unused-vars': 'warn',
    'no-confusing-arrow': [ 'warn', { allowParens: true } ],
    'space-unary-ops': [ 2, { words: true, nonwords: false, overrides: { '!': true } } ],
  },
}
