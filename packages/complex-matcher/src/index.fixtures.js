import {
  And,
  Not,
  Or,
  Property,
  StringNode,
  TruthyProperty,
} from './'

export const pattern = 'foo !"\\\\ \\"" name:|(wonderwoman batman) hasCape?'

export const ast = new And([
  new StringNode('foo'),
  new Not(new StringNode('\\ "')),
  new Property(
    'name',
    new Or([new StringNode('wonderwoman'), new StringNode('batman')])
  ),
  new TruthyProperty('hasCape'),
])
