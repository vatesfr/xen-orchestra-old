import isEmpty from 'lodash/isEmpty'

import Collection from '../collection/redis'
import Model from '../model'

import { parseProp } from './utils'

// ===================================================================

export default class Group extends Model {}

// ===================================================================

export class Groups extends Collection {
  get Model () {
    return Group
  }

  create (name) {
    return this.add({ name })
  }

  _serialize ({ ...group }) {
    let tmp

    group.users = isEmpty(tmp = group.users)
      ? undefined
      : JSON.stringify(tmp)

    return group
  }

  _unserialize ({ ...group }) {
    group.users = parseProp('group', group, 'users', [])

    return group
  }
}
