// @flow

import chalk from 'chalk'

const bind = (method: Function | string, thisArg: Object): Function => {
  const f: Function = typeof method === 'string'
    ? thisArg[method]
    : method
  return function () { return f.apply(thisArg, arguments) }
}

function dispatch (v) {
  const type = typeof v
  const printer = PRINTERS[type]
  if (printer === undefined) {
    throw new TypeError(`unsupported type ${type}`)
  }
  return printer.call(this, v)
}
const PRINTERS = {
  array (v) {
    this.indent()
    v.forEach(v => {
      this.printIndent()
      this.print(chalk.green('- '))
      dispatch.call(this, v)
      this.print('\n')
    }, this)
    this.dedent()
  },
  boolean (v) {
    this.print(chalk.bold(v ? 'true' : 'false'))
  },
  null (v) {
    this.print(chalk.bold('null'))
  },
  number (v) {
    this.print(chalk.bold(v))
  },
  object (v) {
    if (v === null) {
      return PRINTERS.null.call(this, v)
    }
    if (Array.isArray(v)) {
      return PRINTERS.array.call(this, v)
    }
    const keys = Object.keys(v)
    keys.sort().forEach(key => {

    })
  },
  string (v) {
    this.print(v)
  },
  undefined (v) {
    this.print(chalk.bold('undefined'))
  }
}

type Options = {
  print: (value: string) => void
}
export default function prettyPrintCli (v: any, {
  print: p = bind('write', process.stdout)
} : Options = {}): void {
  let i = ''
  return dispatch.call({
    dedent () {
      i = i.slice(2)
    },
    indent () {
      i += '  '
    },
    print (v) {
      p(v)
    },
    printIndent () {
      p(i)
    }
  }, v)
}
