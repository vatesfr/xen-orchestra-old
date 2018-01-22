/* eslint-env jest */

import mapValues from 'lodash/mapValues'
import { DateTime } from 'luxon'

import next from './next'
import parse from './parse'

const N = (pattern, fromDate = '2018-01-01T00:00') =>
  next(parse(pattern), DateTime.fromISO(fromDate, { zone: 'utc' })).toISO({
    includeOffset: false,
    suppressMilliseconds: true,
    suppressSeconds: true,
  })

describe('next()', () => {
  mapValues(
    {
      minutely: ['* * * * *', '2018-01-01T00:01'],
      hourly: ['@hourly', '2018-01-01T01:00'],
      daily: ['@daily', '2018-01-02T00:00'],
      monthly: ['@monthly', '2018-02-01T00:00'],
      yearly: ['0 0 1 jan *', '2019-01-01T00:00'],
      weekly: ['0 0 * * mon', '2018-01-08T00:00'],
    },
    ([pattern, result], title) =>
      it(title, () => {
        expect(N(pattern)).toBe(result)
      })
  )

  it('select first between month-day and week-day', () => {
    expect(N('0 0 1 * mon')).toBe('2018-01-08T00:00')
    expect(N('0 0 2 * mon')).toBe('2018-01-02T00:00')
  })

  it('select the last available day of a month', () => {
    expect(N('0 0 29 feb *')).toBe('2020-02-29T00:00')
  })

  it('fails when no solutions has been found', () => {
    expect(() => N('0 0 30 feb *')).toThrow(
      'no solutions found for this schedule'
    )
  })
})
