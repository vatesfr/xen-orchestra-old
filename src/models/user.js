import Collection from '../collection/redis'
import isEmpty from 'lodash/isEmpty'
import Model from '../model'

import { parseProp } from './utils'

// ===================================================================

export default class User extends Model {}

User.prototype.default = {
  permission: 'none',
}

// -------------------------------------------------------------------

export class Users extends Collection {
  get Model () {
    return User
  }

  async create (properties) {
    const { email } = properties

    // Avoid duplicates.
    if (await this.exists({email})) {
      throw new Error(`the user ${email} already exists`)
    }

    // Adds the user to the collection.
    return /* await */ this.add(properties)
  }

  _serialize ({ ...user }) {
    let tmp

    user.groups = isEmpty(tmp = user.groups)
      ? undefined
      : JSON.stringify(tmp)
    user.preferences = isEmpty(tmp = user.preferences)
      ? undefined
      : JSON.stringify(tmp)

    return user
  }

  _unserialize ({ ...user }) {
    user.groups = parseProp('user', user, 'groups', [])
    user.preferences = parseProp('user', user, 'preferences', {})

    return user
  }
}
