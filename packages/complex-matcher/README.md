# complex-matcher [![Build Status](https://travis-ci.org/vatesfr/xen-orchestra.png?branch=master)](https://travis-ci.org/vatesfr/xen-orchestra)

> ${pkg.description}

## Install

Installation of the [npm package](https://npmjs.org/package/complex-matcher):

```
> npm install --save complex-matcher
```

## Usage

```js
import { parse, createStringNode } from 'complex-matcher'

const characters = [
  { name: 'Catwoman', costumeColor: 'black' },
  { name: 'Superman', costumeColor: 'blue', hasCape: true },
  { name: 'Wonder Woman', costumeColor: 'blue' },
]

const predicate = parse('costumeColor:blue hasCape?').createPredicate()

characters.filter(predicate)
// [
//   { name: 'Superman', costumeColor: 'blue', hasCape: true },
// ]

createStringNode('foo').createPredicate()
```

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
