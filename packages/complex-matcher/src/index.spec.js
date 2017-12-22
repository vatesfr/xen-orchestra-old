/* eslint-env jest */

import {
  getPropertyClausesStrings,
  parse,
  removePropertyClause,
  setPropertyClause,
} from './'
import { ast, pattern } from './index.fixtures'

it('getPropertyClausesStrings', () => {
  const tmp = getPropertyClausesStrings(parse('foo bar:baz baz:|(foo bar)'))
  expect(tmp).toEqual({
    bar: ['baz'],
    baz: ['foo', 'bar'],
  })
})

it('parse', () => {
  expect(parse(pattern)).toEqual(ast)
})

it('removePropertyClause', () => {
  expect(removePropertyClause(parse('foo bar:baz qux'), 'bar').toString()).toBe('foo qux')
  expect(removePropertyClause(parse('foo bar:baz qux'), 'baz').toString()).toBe('foo bar:baz qux')
})

it('setPropertyClause', () => {
  expect(setPropertyClause(undefined, 'foo', 'bar').toString()).toBe('foo:bar')

  expect(
    setPropertyClause(parse('baz'), 'foo', 'bar').toString()
  ).toBe('baz foo:bar')

  expect(
    setPropertyClause(parse('plip foo:baz plop'), 'foo', 'bar').toString()
  ).toBe('plip plop foo:bar')

  expect(
    setPropertyClause(parse('foo:|(baz plop)'), 'foo', 'bar').toString()
  ).toBe('foo:bar')
})

it('toString', () => {
  expect(pattern).toBe(ast.toString())
})
