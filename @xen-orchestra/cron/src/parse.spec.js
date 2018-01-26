/* eslint-env jest */

import parse from './parse'

describe('parse()', () => {
  it('works', () => {
    expect(parse('0 0-10 */10 jan,2,4-11/3 *')).toEqual({
      minute: [0],
      hour: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      dayOfMonth: [1, 11, 21, 31],
      month: [1, 3, 5, 8, 11],
    })
  })

  it('correctly parse months', () => {
    expect(parse('* * * 0,11 *')).toEqual({
      month: [1, 12],
    })
    expect(parse('* * * jan,dec *')).toEqual({
      month: [1, 12],
    })
  })

  it('reports missing integer', () => {
    expect(() => parse('*/a')).toThrow('minute: missing integer at character 2')
    expect(() => parse('*')).toThrow('hour: missing integer at character 1')
  })

  it('reports invalid aliases', () => {
    expect(() => parse('* * * jan-foo *')).toThrow(
      'month: missing alias or integer at character 10'
    )
  })

  it('dayOfWeek: 0 and 7 bind to sunday', () => {
    expect(parse('* * * * 0')).toEqual({
      dayOfWeek: [7],
    })
    expect(parse('* * * * 7')).toEqual({
      dayOfWeek: [7],
    })
  })
})
