import * as CM from './'

export const pattern =
  'foo !"\\\\ \\"" name:|(wonderwoman batman) hasCape? age:32'

export const ast = new CM.And([
  new CM.String('foo'),
  new CM.Not(new CM.String('\\ "')),
  new CM.Property(
    'name',
    new CM.Or([new CM.String('wonderwoman'), new CM.String('batman')])
  ),
  new CM.TruthyProperty('hasCape'),
  new CM.Property('age', new CM.Number(32)),
])
