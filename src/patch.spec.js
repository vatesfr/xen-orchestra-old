/* eslint-env jest */

import patch from './patch'

// ===================================================================

describe('patch()', () => {
  describe('with arrays', () => {
    it('can append entries', () => {
      expect(patch(['foo'], { '+': ['bar', 'baz'] })).toEqual([
        'foo',
        'bar',
        'baz',
      ])
    })

    it('can remove entries at given positions', () => {
      expect(patch(['foo', 'bar', 'baz'], { 0: null, 2: undefined })).toEqual([
        'bar',
      ])
    })

    it('can remove entries matching a value-matcher pattern', () => {
      expect(
        patch(['foo', 'bar', 'baz'], { '-': { __or: ['bar', 'baz'] } })
      ).toEqual(['foo'])
    })
  })

  describe('with objects', () => {
    it('can set properties', () => {
      expect(patch({ foo: 1, bar: 1 }, { bar: 2, baz: 3 })).toEqual({
        foo: 1,
        bar: 2,
        baz: 3,
      })
    })

    it('remove properties', () => {
      expect(
        patch({ foo: 1, bar: 2, baz: 3 }, { foo: null, baz: undefined })
      ).toEqual({ bar: 2 })
    })
  })
})
