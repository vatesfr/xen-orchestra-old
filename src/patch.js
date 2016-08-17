import isPlainObject from 'lodash/isPlainObject'
import { createPredicate } from 'value-matcher'

const nullPredicate = () => false
const createOptionalPredicate = pattern =>
  pattern === undefined ? nullPredicate : createPredicate(pattern)

const { keys } = Object
const { isArray, prototype: { push } } = Array

const applyPatch = (value, patch) => {
  if (isPlainObject(patch)) {
    if (isArray(value)) {
      const toRemove = createOptionalPredicate(patch['-'])

      const tmp = []
      for (let i = 0, n = value.length; i < n; ++i) {
        const v = value[i]
        if (i in patch) {
          const p = patch[i]
          if (p != null) {
            tmp.push(applyPatch(v, p))
          }
        } else if (!toRemove(v)) {
          tmp.push(v)
        }
      }

      const toAdd = patch['+']
      if (toAdd !== undefined) {
        push.apply(tmp, toAdd)
      }

      return tmp
    }

    if (isPlainObject(value)) {
      value = { ...value }
      keys(patch).forEach(k => {
        const p = patch[k]
        if (p == null) {
          delete value[k]
        } else {
          value[k] = applyPatch(value[k], p)
        }
      })
      return value
    }

    value = {}
    keys(patch).forEach(k => {
      const p = patch[k]
      if (p != null) {
        value[k] = applyPatch(undefined, p)
      }
    })
    return patch
  }

  return patch
}
export { applyPatch as default }
