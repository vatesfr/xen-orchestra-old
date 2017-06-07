import { forbiddenOperation, noSuchObject } from 'xo-common/api-errors'

import { createRawObject, generateId } from '../utils'

const FAILURE = 'failure'
const PENDING = 'pending'
const SUCCESS = 'success'

export default class Tasks {
  _tasks = createRawObject(null)

  createTask (promise, {
    cancel = promise.cancel,
    data,
    label = 'unnamed task',
  } = {}) {
    const id = generateId()
    const task = this._tasks[id] = Object.defineProperties({
      id,
      label,
      status: PENDING,
      type: 'task',
    }, {
      cancel: {
        value: cancel,
        writable: true,
      },
      data: {
        value: data,
      },
      promise: {
        value: promise,
      },
    })

    promise.then(
      result => {
        task.status = SUCCESS
        task.result = result
      },
      error => {
        task.status = FAILURE
        task.error = error
      }
    )

    return id
  }

  cancelTask (id) {
    const task = this._tasks[id]
    if (task === undefined) {
      throw noSuchObject(id, 'task')
    }

    const { cancel } = task.cancel
    if (cancel === undefined) {
      throw forbiddenOperation('cancel')
    }

    task.cancel = undefined
    return cancel()
  }
}
