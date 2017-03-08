#!/usr/bin/env node

import chalk from 'chalk'
import execPromise from 'exec-promise'
import humanFormat from 'human-format'
import { forEach } from 'lodash'
import { RemoteHandlerLocal } from '@nraynaud/xo-fs'

import Vhd from './vhd'

const keyFmt = chalk.bold
const valueFmt = chalk.reset

const sizeFmt = bytes => humanFormat(bytes, { scale: 'binary' })

execPromise(async args => {
  const handler = new RemoteHandlerLocal({ url: 'file:///' })
  const wln = str => {
    str && process.stdout.write(str)
    process.stdout.write('\n')
  }

  wln()
  for (const path of args) {
    wln(path)

    const vhd = new Vhd(handler, path)

    await vhd.readHeaderAndFooter()

    forEach({
      Date: new Date(vhd._footer.timestamp * 1e3),
      Size: sizeFmt(vhd.size),
      Type: vhd._footer.diskType,
      'Block size': sizeFmt(vhd._header.blockSize),
      'Max blocks': humanFormat(vhd._header.maxTableEntries, { scale: 'binary', unit: '' }),
    }, (value, key) => {
      wln(`${keyFmt(key)}: ${valueFmt(value)}`)
    })
    wln()
  }
})
