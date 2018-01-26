# @xen-orchestra/cron [![Build Status](https://travis-ci.org/vatesfr/xen-orchestra.png?branch=master)](https://travis-ci.org/vatesfr/xen-orchestra)

> Focused, well maintained, cron parser/scheduler

## Install

Installation of the [npm package](https://npmjs.org/package/@xen-orchestra/cron):

```
> npm install --save @xen-orchestra/cron
```

## Usage

```js
import * as Cron from '@xen-orchestra/cron'

Cron.parse('* * * jan,mar *')
// → { month: [ 1, 3 ] }

Cron.next('* * * jan,mar *', 2, 'America/New_York')
// → [ 2018-01-19T22:15:00.000Z, 2018-01-19T22:16:00.000Z ]

const stop = Cron.schedule('@hourly', () => {
  console.log(new Date())
}, 'UTC+05:30')
```

### Pattern syntax

```
<minute> <hour> <day of month> <month> <day of week>
```


Each entry can be:

- a single value
- a range (`0-23` or `*/2`)
- a list of values/ranges (`1,8-12`)

A wildcard (`*`) can be use as a shortcut for the whole range
(`first-last`).

A step values can be used in conjunctions with ranges. For instance,
`1-7/2` is the same as `1,3,5,7`.

| Field            | Allowed values |
|------------------|----------------|
| minute           | 0-59           |
| hour             | 0-23           |
| day of the month | 1-31 or 3-letters names (`jan`, `feb`, …) |
| month            | 1-12           |
| day of week      | 0-7 (0 and 7 both mean Sunday) or 3-letters names (`mon`, `tue`, …) |

## Development

```
# Install dependencies
> yarn

# Run the tests
> yarn test

# Continuously compile
> yarn dev

# Continuously run the tests
> yarn dev-test

# Build for production (automatically called by npm install)
> yarn build
```

## Contributions

Contributions are *very* welcomed, either on the documentation or on
the code.

You may:

- report any [issue](https://github.com/vatesfr/xo-web/issues)
  you've encountered;
- fork and create a pull request.

## License

ISC © [Vates SAS](https://vates.fr)
