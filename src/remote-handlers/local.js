import fs from 'fs-promise'
import {
  dirname
} from 'path'

import RemoteHandlerAbstract from './abstract'
import {
  noop,
  resolveSubpath
} from '../utils'

export default class LocalHandler extends RemoteHandlerAbstract {
  get type () {
    return 'file'
  }

  _getRealPath () {
    return this._remote.path
  }

  _getFilePath (file) {
    return resolveSubpath(this._getRealPath(), file)
  }

  async _sync () {
    if (this._remote.enabled) {
      try {
        const path = this._getRealPath()
        await fs.ensureDir(path)
        await fs.access(path, fs.R_OK | fs.W_OK)
      } catch (exc) {
        this._remote.enabled = false
        this._remote.error = exc.message
      }
    }
    return this._remote
  }

  async _forget () {
    return noop()
  }

  async _outputFile (file, data, options) {
    const path = this._getFilePath(file)
    await fs.ensureDir(dirname(path))
    await fs.writeFile(path, data, options)
  }

  async _readFile (file, options) {
    return fs.readFile(this._getFilePath(file), options)
  }

  async _rename (oldPath, newPath) {
    return fs.rename(this._getFilePath(oldPath), this._getFilePath(newPath))
  }

  async _list (dir = '.') {
    return fs.readdir(this._getFilePath(dir))
  }

  async _createReadStream (file, options) {
    return fs.createReadStream(this._getFilePath(file), options)
  }

  async _createOutputStream (file, options) {
    const path = this._getFilePath(file)
    await fs.ensureDir(dirname(path))
    return fs.createWriteStream(path, options)
  }

  async _unlink (file) {
    return fs.unlink(this._getFilePath(file))
  }

  async _getSize (file) {
    const stats = await fs.stat(this._getFilePath(file))
    return stats.size
  }
}
