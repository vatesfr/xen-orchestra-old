const { create, keys } = Object

const makeSpy = (obj, get) => {
  const descriptors = {}
  const keys_ = keys(obj)
  for (let i = 0, n = keys_.length; i < n; ++i) {
    const key = keys_[i]
    descriptors[key] = {
      enumerable: true,
      get: () => get(obj, key),
    }
  }
  return create(null, descriptors)
}

const createSelector = (inputSelectors, transform) => {
  const previousArgs = [{}] // initialize with non-repeatable args
  let cache, previousResult, previousThisArg
  let previousInputs = {}
  const spy = makeSpy(
    inputSelectors,
    (inputs, input) =>
      input in previousInputs
        ? previousInputs[input]
        : (previousInputs[input] =
            input in cache
              ? cache[input]
              : inputs[input].apply(previousThisArg, previousArgs))
  )
  function selector () {
    // handle arguments
    {
      const { length } = arguments
      let i = 0
      if (this === previousThisArg && length === previousArgs.length) {
        while (i < length && arguments[i] === previousArgs[i]) {
          ++i
        }
        if (i === length) {
          return previousResult
        }
      } else {
        previousArgs.length = length
        previousThisArg = this
      }
      while (i < length) {
        previousArgs[i] = arguments[i]
        ++i
      }
    }

    // handle inputs
    cache = previousInputs
    previousInputs = {}
    {
      const inputs = Object.keys(cache)
      const { length } = inputs
      if (length !== 0) {
        let i = 0
        while (true) {
          if (i === length) {
            // inputs are unchanged
            return previousResult
          }

          const input = inputs[i++]
          const value = inputSelectors[input].apply(this, arguments)
          if (value !== cache[input]) {
            // update the value
            cache[input] = value

            // remove non-computed values
            while (i < length) {
              delete cache[inputs[i++]]
            }

            break
          }
        }
      }
    }

    return (previousResult = transform(spy))
  }
  return selector
}
export { createSelector as default }
