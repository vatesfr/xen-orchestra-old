/* eslint no-throw-literal: 0 */

import eventToPromise from 'event-to-promise'
import { bind, find, identity, noop } from 'lodash'
import { createClient } from 'ldapjs'
import { escape } from 'ldapjs/lib/filters/escape'
import { promisify } from 'promise-toolbox'
import { readFile } from 'fs'

// ===================================================================

const VAR_RE = /\{\{([^}]+)\}\}/g
const evalFilter = (filter, vars) => filter.replace(VAR_RE, (_, name) => {
  const value = vars[name]

  if (value === undefined) {
    throw new Error('invalid variable: ' + name)
  }

  return escape(value)
})
const makeEvalFormat = format => format === undefined
  ? identity
  : (input, record) => format.replace(VAR_RE, (_, name) => {
    if (name === 'input') {
      return input
    }

    let tmp = find(record.attributes, _ => _.type === name)
    if (
      tmp !== undefined &&
      (tmp = tmp.vals).length !== 0
    ) {
      return tmp[0]
    }

    throw new Error(`invalid entry ${name}`)
  })

export const configurationSchema = {
  type: 'object',
  properties: {
    uri: {
      description: 'URI of the LDAP server.',
      type: 'string',
    },
    certificateAuthorities: {
      description: `
Paths to CA certificates to use when connecting to SSL-secured LDAP servers.

If not specified, it will use a default set of well-known CAs.
`.trim(),
      type: 'array',
      items: {
        type: 'string',
      },
    },
    checkCertificate: {
      description: 'Enforce the validity of the server\'s certificates. You can disable it when connecting to servers that use a self-signed certificate.',
      type: 'boolean',
      default: true,
    },
    bind: {
      description: 'Credentials to use before looking for the user record.',
      type: 'object',
      properties: {
        dn: {
          description: `
Full distinguished name of the user permitted to search the LDAP directory for the user to authenticate.

Example: uid=xoa-auth,ou=people,dc=company,dc=net

For Microsoft Active Directory, it can also be \`<user>@<domain>\`.
`.trim(),
          type: 'string',
        },
        password: {
          description: 'Password of the user permitted of search the LDAP directory.',
          type: 'string',
        },
      },
      required: ['dn', 'password'],
    },
    base: {
      description: 'The base is the part of the description tree where the users are looked for.',
      type: 'string',
    },
    filter: {
      description: `
Filter used to find the user.

For Microsoft Active Directory, you can try one of the following filters:

- \`(cn={{name}})\`
- \`(sAMAccountName={{name}})\`
- \`(sAMAccountName={{name}}@<domain>)\` (replace \`<domain>\` by your own domain)
- \`(userPrincipalName={{name}})\`

For LDAP if you want to filter for a special group you can try
something like:

- \`(&(uid={{name}})(memberOf=<group DN>))\`
`.trim(),
      type: 'string',
      default: '(uid={{name}})',
    },
    usernameFormat: {
      description: `

`.trim(),
      type: 'string',
    },
  },
  required: ['uri', 'base'],
}

export const testSchema = {
  type: 'object',
  properties: {
    username: {
      description: 'LDAP username',
      type: 'string',
    },
    password: {
      description: 'LDAP password',
      type: 'string',
    },
  },
  required: ['username', 'password'],
}

// ===================================================================

class AuthLdap {
  constructor (xo) {
    this._xo = xo

    this._authenticate = bind(this._authenticate, this)
  }

  async configure (conf) {
    const clientOpts = this._clientOpts = {
      url: conf.uri,
      maxConnections: 5,
      tlsOptions: {},
    }

    {
      const {
        bind,
        checkCertificate = true,
        certificateAuthorities,
      } = conf

      if (bind) {
        clientOpts.bindDN = bind.dn
        clientOpts.bindCredentials = bind.password
      }

      const {tlsOptions} = clientOpts

      tlsOptions.rejectUnauthorized = checkCertificate
      if (certificateAuthorities) {
        tlsOptions.ca = await Promise.all(
          certificateAuthorities.map(path => readFile(path))
        )
      }
    }

    this._credentials = conf.bind
    this._formatUsername = makeEvalFormat(conf.usernameFormat)
    this._searchBase = conf.base
    this._searchFilter = conf.filter
  }

  load () {
    this._xo.registerAuthenticationProvider(this._authenticate)
  }

  unload () {
    this._xo.unregisterAuthenticationProvider(this._authenticate)
  }

  test ({ username, password }) {
    return this._authenticate({
      username,
      password,
    }).then(result => {
      if (result === null) {
        throw new Error('could not authenticate user')
      }
    })
  }

  async _authenticate ({ username, password }, logger = noop) {
    if (username === undefined || password === undefined) {
      logger('require `username` and `password` to authenticate!')

      return null
    }

    const client = createClient(this._clientOpts)

    try {
      // Promisify some methods.
      const bind = promisify(client.bind, client)
      const search = promisify(client.search, client)

      await eventToPromise(client, 'connect')

      // Bind if necessary.
      {
        const {_credentials: credentials} = this
        if (credentials) {
          logger(`attempting to bind with as ${credentials.dn}...`)
          await bind(credentials.dn, credentials.password)
          logger(`successfully bound as ${credentials.dn}`)
        }
      }

      // Search for the user.
      const entries = []
      {
        logger('searching for entries...')
        const response = await search(this._searchBase, {
          scope: 'sub',
          filter: evalFilter(this._searchFilter, {
            name: username,
          }),
        })

        response.on('searchEntry', entry => {
          logger('.')
          entries.push(entry.json)
        })

        const {status} = await eventToPromise(response, 'end')
        if (status) {
          throw new Error('unexpected search response status: ' + status)
        }

        logger(`${entries.length} entries found`)
      }

      // Try to find an entry which can be bind with the given password.
      for (const entry of entries) {
        try {
          logger(`attempting to bind as ${entry.objectName}`)
          await bind(entry.objectName, password)

          username = this._formatUsername(username, entry)

          logger(`successfully bound as ${entry.objectName} => ${username} authenticated`)

          return { username }
        } catch (error) {
          logger(`failed to bind as ${entry.objectName}: ${error.message}`)
        }
      }

      logger(`could not authenticate ${username}`)
      return null
    } finally {
      client.unbind()
    }
  }
}

// ===================================================================

export default ({xo}) => new AuthLdap(xo)
