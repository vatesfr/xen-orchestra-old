import { BaseError } from 'make-error'
import { createPredicate } from 'value-matcher'
import { timeout } from 'promise-toolbox'
import {
  assign,
  filter,
  find,
  isEmpty,
  map,
  mapValues,
} from 'lodash'

import { crossProduct } from './math'
import {
  asyncMap,
  serializeError,
  thunkToArray,
} from './utils'

export class JobExecutorError extends BaseError {}
export class UnsupportedJobType extends JobExecutorError {
  constructor (job) {
    super('Unknown job type: ' + job.type)
  }
}
export class UnsupportedVectorType extends JobExecutorError {
  constructor (vector) {
    super('Unknown vector type: ' + vector.type)
  }
}

// ===================================================================

const paramsVectorActionsMap = {
  extractProperties ({ mapping, value }) {
    return mapValues(mapping, key => value[key])
  },
  crossProduct ({ items }) {
    return thunkToArray(crossProduct(
      map(items, value => resolveParamsVector.call(this, value))
    ))
  },
  fetchObjects ({ pattern }) {
    const objects = filter(this.xo.getObjects(), createPredicate(pattern))
    if (isEmpty(objects)) {
      throw new Error('no objects match this pattern')
    }
    return objects
  },
  map ({ collection, iteratee, paramName = 'value' }) {
    return map(resolveParamsVector.call(this, collection), value => {
      return resolveParamsVector.call(this, {
        ...iteratee,
        [paramName]: value,
      })
    })
  },
  set: ({ values }) => values,
}

export function resolveParamsVector (paramsVector) {
  const visitor = paramsVectorActionsMap[paramsVector.type]
  if (!visitor) {
    throw new Error(`Unsupported function '${paramsVector.type}'.`)
  }

  return visitor.call(this, paramsVector)
}

// ===================================================================

export default class JobExecutor {
  constructor (xo) {
    this.xo = xo

    // The logger is not available until Xo has started.
    xo.on('start', () => xo.getLogger('jobs').then(logger => {
      this._logger = logger
    }))
  }

  async exec (job) {
    const runJobId = this._logger.notice(`Starting execution of ${job.id}.`, {
      event: 'job.start',
      userId: job.userId,
      jobId: job.id,
      key: job.key,
    })

    try {
      if (job.type === 'call') {
        const execStatus = await this._execCall(job, runJobId)

        this.xo.emit('job:terminated', execStatus)
      } else {
        throw new UnsupportedJobType(job)
      }

      this._logger.notice(`Execution terminated for ${job.id}.`, {
        event: 'job.end',
        runJobId,
      })
    } catch (error) {
      this._logger.error(`The execution of ${job.id} has failed.`, {
        event: 'job.end',
        runJobId,
        error: serializeError(error),
      })

      throw error
    }
  }

  async _execCall (job, runJobId) {
    const { paramsVector } = job
    const paramsFlatVector = paramsVector
      ? resolveParamsVector.call(this, paramsVector)
      : [{}] // One call with no parameters

    const connection = this.xo.createUserConnection()

    connection.set('user_id', job.userId)

    const schedule = find(await this.xo.getAllSchedules(), { job: job.id })

    const execStatus = {
      calls: {},
      runJobId,
      start: Date.now(),
      timezone: schedule !== undefined ? schedule.timezone : undefined,
    }

    await asyncMap(paramsFlatVector, params => {
      const runCallId = this._logger.notice(`Starting ${job.method} call. (${job.id})`, {
        event: 'jobCall.start',
        runJobId,
        method: job.method,
        params,
      })

      const call = execStatus.calls[runCallId] = {
        method: job.method,
        params,
        start: Date.now(),
      }
      let promise = this.xo.callApiMethod(connection, job.method, assign({}, params))
      if (job.timeout) {
        promise = promise::timeout(job.timeout)
      }

      return promise.then(
        value => {
          this._logger.notice(`Call ${job.method} (${runCallId}) is a success. (${job.id})`, {
            event: 'jobCall.end',
            runJobId,
            runCallId,
            returnedValue: value,
          })

          call.returnedValue = value
          call.end = Date.now()
        },
        reason => {
          this._logger.notice(`Call ${job.method} (${runCallId}) has failed. (${job.id})`, {
            event: 'jobCall.end',
            runJobId,
            runCallId,
            error: serializeError(reason),
          })

          call.error = reason
          call.end = Date.now()
        }
      )
    })

    connection.close()
    execStatus.end = Date.now()

    return execStatus
  }
}
