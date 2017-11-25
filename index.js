const index = require('./build/index.js')
const _ = require('lodash/fp')

const wrap = (fn) => function () {
  const args = Array.prototype.slice.call(arguments);
  const _cb = args[args.length - 1]
  const cb = !_.isFunction(_cb) ? (() => { }) : _cb;
  try {
    const prom = fn.apply(null, args.splice(0, args.length - 1))
    if (prom && prom.then) {
      prom
        .then(ret => cb(null, ret))
        .catch(err => cb(err))
    } else {
      cb(null, prom)
    }
  } catch (e) {
    index.error(e)
    cb(e)
  }
}

module.exports = _.mapValues(v => wrap(v), index)
