import Client from 'jsonrpc-websocket-client'
import eventToPromise from 'event-to-promise'
import request from 'superagent'
import { PassThrough } from 'stream'

const UPDATER_URL = 'localhost'
const WS_PORT = 9001
const HTTP_PORT = 9002

// ===================================================================

export const configurationSchema = {}

// ===================================================================

const bind = (fn, thisArg) => function __bound__ () {
  return fn.apply(thisArg, arguments)
}

// ===================================================================

class XoServerCloud {
  constructor ({ xo }) {
    this._set = bind(xo.defineProperty, xo)
    this._xo = xo

    this._getCatalog = bind(this._getCatalog, this)
    this._getNamespaces = bind(this._getNamespaces, this)
    this._registerResource = bind(this._registerResource, this)
    this._getNamespaceCatalog = bind(this._getNamespaceCatalog, this)
    this._requestResource = bind(this._requestResource, this)

   // Defined in configure().
    this._conf = null
    this._key = null
  }

  configure (configuration) {
    this._conf = configuration
  }

  async load () {
    this._unsetGetCatalog = this._set('getResourceCatalog', this._getCatalog)
    this._unsetRegisterResource = this._set('registerResource', this._registerResource)
    this._unsetRequestResource = this._set('requestResource', this._requestResource)

    this._updater = new Client(`${UPDATER_URL}:${WS_PORT}`)
    this._updater.open()
  }

  unload () {
    this._unsetGetCatalog()
    this._unsetRegisterResource()
    this._unsetRequestResource()
  }

  // ----------------------------------------------------------------

  async _getCatalog () {
    const catalog = await this._updater.call('getResourceCatalog')

    if (!catalog) {
      throw new Error('cannot get catalog')
    }

    return catalog
  }

  // ----------------------------------------------------------------

  async _getNamespaces () {
    const catalog = await this._getCatalog()

    if (!catalog._namespaces) {
      throw new Error('cannot get namespaces')
    }

    return catalog._namespaces
  }

  // ----------------------------------------------------------------

  async _registerResource (namespace) {
    const _namespace = (await this._getNamespaces())[namespace]

    if (_namespace.registered || _namespace.pending) {
      return new Error(`already registered for ${namespace}`)
    }

    return this._updater.call('registerResource', { namespace })
  }

  // ----------------------------------------------------------------

  async _getNamespaceCatalog (namespace) {
    const namespaceCatalog = (await this._getCatalog())[namespace]

    if (!namespaceCatalog) {
      throw new Error(`cannot get catalog: ${namespace} not registered`)
    }

    return namespaceCatalog
  }

  // ----------------------------------------------------------------

  async _requestResource (namespace, id, version) {
    const _namespace = (await this._getNamespaces())[namespace]

    if (!_namespace || !_namespace.registered) {
      throw new Error(`cannot get resource: ${namespace} not registered`)
    }

    const namespaceCatalog = await this._getNamespaceCatalog(namespace)

    const downloadToken = await this._updater.call('getResourceDownloadToken', {
      token: namespaceCatalog._token,
      id,
      version
    })

    if (!downloadToken) {
      throw new Error('cannot get download token')
    }

    const req = request.get(`${UPDATER_URL}:${HTTP_PORT}/`)
      .set('Authorization', `Bearer ${downloadToken}`)

    const pt = new PassThrough()
    req.pipe(pt)
    pt.length = (await eventToPromise(req, 'response')).headers['content-length']

    return pt
  }
}

export default opts => new XoServerCloud(opts)
