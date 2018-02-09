import { forEach, isFinite, isInteger } from 'lodash'
import { forOwn as forOwnAsync } from 'promise-toolbox'
import { prompt } from 'inquirer'

// ===================================================================

const EMPTY_OBJECT = Object.freeze({ __proto__: null })

const _extractValue = ({ value }) => value

export const confirm = (message, {
  default: defaultValue = null,
} = EMPTY_OBJECT) => prompt({
  default: defaultValue,
  message,
  name: 'value',
  type: 'confirm',
}).then(_extractValue)

export const input = (message, {
  default: defaultValue = null,
  filter = undefined,
  validate = undefined,
} = EMPTY_OBJECT) => prompt({
  default: defaultValue,
  message,
  name: 'value',
  type: 'input',
  validate,
}).then(_extractValue)

export const list = (message, choices, {
  default: defaultValue = null,
} = EMPTY_OBJECT) => prompt({
  default: defaultValue,
  choices,
  message,
  name: 'value',
  type: 'list',
}).then(_extractValue)

export const password = (message, {
  default: defaultValue = null,
  filter = undefined,
  validate = undefined,
} = EMPTY_OBJECT) => prompt({
  default: defaultValue,
  message,
  name: 'value',
  type: 'password',
  validate,
}).then(_extractValue)

// ===================================================================

const promptByType = {
  __proto__: null,

  array: async (schema, defaultValue, path) => {
    const items = []
    if (defaultValue == null) {
      defaultValue = items
    }

    let i = 0

    const itemSchema = schema.items
    const promptItem = async () => {
      items[i] = await promptGeneric(
        itemSchema,
        defaultValue[i],
        path
          ? `${path} [${i}]`
          : `[${i}]`
      )

      ++i
    }

    let n = schema.minItems || 0
    while (i < n) { // eslint-disable-line no-unmodified-loop-condition
      await promptItem()
    }

    n = schema.maxItems || Infinity
    while (
      i < n && // eslint-disable-line no-unmodified-loop-condition
      await confirm('additional item?', {
        default: false,
      })
    ) {
      await promptItem()
    }

    return items
  },

  boolean: (schema, defaultValue, path) => confirm(path, {
    default: defaultValue != null ? defaultValue : schema.default,
  }),

  enum: (schema, defaultValue, path) => list(path, schema.enum, {
    defaultValue: defaultValue || schema.defaultValue,
  }),

  integer: (schema, defaultValue, path) => input(path, {
    default: defaultValue || schema.default,
    filter: input => +input,
    validate: input => isInteger(+input),
  }),

  number: (schema, defaultValue, path) => input(path, {
    default: defaultValue || schema.default,
    filter: input => +input,
    validate: input => isFinite(+input),
  }),

  object: async (schema, defaultValue, path) => {
    const value = {}

    const required = {}
    schema.required && forEach(schema.required, name => {
      required[name] = true
    })

    const promptProperty = async (schema, name) => {
      const subpath = path
        ? `${path} > ${schema.title || name}`
        : schema.title || name

      if (
        required[name] ||
        await confirm(`fill optional ${subpath}?`, {
          default: Boolean(defaultValue && name in defaultValue),
        })
      ) {
        value[name] = await promptGeneric(
          schema,
          defaultValue && defaultValue[name],
          subpath
        )
      } else {
        value[name] = schema.default
      }
    }

    await forOwnAsync.call(schema.properties || {}, promptProperty)

    return value
  },

  string: (schema, defaultValue, path) => input(path, {
    default: defaultValue || schema.default,
  }),
}

export default function promptGeneric (schema, defaultValue, path) {
  const type = schema.enum
    ? 'enum'
    : schema.type

  const prompt = promptByType[type.toLowerCase()]
  if (!prompt) {
    throw new Error(`unsupported type: ${type}`)
  }

  return prompt(schema, defaultValue, path)
}
