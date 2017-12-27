import {
  every,
  isArray,
  isPlainObject,
  size,
  some,
} from 'lodash'

export default function match (pattern, value) {
  if (isPlainObject(pattern)) {
    if (size(pattern) === 1) {
      let op
      if ((op = pattern.__or) !== undefined) {
        return some(op, subpattern => match(subpattern, value))
      }
      if ((op = pattern.__not) !== undefined) {
        return !match(op, value)
      }
    }

    return isPlainObject(value) && every(pattern, (subpattern, key) => (
      value[key] !== undefined && match(subpattern, value[key])
    ))
  }

  if (isArray(pattern)) {
    return isArray(value) && every(pattern, subpattern =>
      some(value, subvalue => match(subpattern, subvalue))
    )
  }

  return pattern === value
}
