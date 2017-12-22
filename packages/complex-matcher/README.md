# ${pkg.name} [![Build Status](https://travis-ci.org/${pkg.shortGitHubPath}.png?branch=master)](https://travis-ci.org/${pkg.shortGitHubPath})

> ${pkg.description}

## Install

Installation of the [npm package](https://npmjs.org/package/${pkg.name}):

```
> npm install --save ${pkg.name}
```

## Usage

```js
import { parse } from 'complex-matcher'

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

- report any [issue](${pkg.bugs})
  you've encountered;
- fork and create a pull request.

## License

${pkg.license} © [${pkg.author.name}](${pkg.author.url})
