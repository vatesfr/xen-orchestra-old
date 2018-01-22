/* eslint-env jest */

import mapValues from 'lodash/mapValues'
import { DateTime } from 'luxon'

import next from './next'
import parse from './parse'

const N = pattern =>
  next(
    parse(pattern),
    DateTime.fromISO('2018-01-01T00:00', { zone: 'utc' })
  ).toISO({
    includeOffset: false,
    suppressMilliseconds: true,
    suppressSeconds: true,
  })

describe('next()', () => {
  mapValues(
    {
      'every minutes': ['* * * * *', '2018-01-01T00:01'],
      'every hours': ['0 * * * *', '2018-01-01T01:00'],
      'every days': ['0 0 * * *', '2018-01-02T00:00'],
      'every months': ['0 0 1 * *', '2018-02-01T00:00'],
      'every years': ['0 0 1 jan *', '2019-01-01T00:00'],
      'every monday': ['0 0 * * 1', '2018-01-08T00:00'],
    },
    ([pattern, result], title) =>
      it(title, () => {
        expect(N(pattern)).toBe(result)
      })
  )

  it('select first between month-day and week-day', () => {
    expect(N('0 0 1 * 1')).toBe('2018-01-08T00:00')
    expect(N('0 0 2 * 1')).toBe('2018-01-02T00:00')
  })

  it('select the last available day of a month', () => {
    expect(N('0 0 31 feb *')).toBe('2018-02-28T00:00')
  })
})
