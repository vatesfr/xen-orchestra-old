import { parseSize } from '../utils'
import { unauthorized } from 'xo-common/api-errors'

// ===================================================================

export async function create ({ name, size, sr, vm, params }) {
  const { resourceSet } = vm

  const attach = vm !== undefined

  if (attach && resourceSet != null) {
    await this.checkResourceSetConstraints(resourceSet, this.user.id, [ sr ])
    await this.allocateLimitsInResourceSet({ disk: size }, resourceSet)
  } else {
    if (!(await this.hasPermissions(this.session.get('user_id'), [ [ sr, 'administrate' ] ]))) {
      throw unauthorized()
    }
  }

  const xapi = this.getXapi(sr)
  sr = this.getObject(sr, 'SR')

  const vdi = await xapi.createVdi(parseSize(size), {
    name_label: name,
    sr: sr._xapiId
  })

  if (attach) {
    const { bootable, position, mode } = params
    await xapi.attachVdiToVm(vdi.$id, vm._xapiId, {
      bootable,
      position,
      readOnly: mode === 'RO'
    })
  }

  return vdi.$id
}

create.description = 'create a new disk on a SR'

create.params = {
  name: { type: 'string' },
  size: { type: ['integer', 'string'] },
  sr: { type: 'string' },
  vm: { type: 'string' },
  params: {
    type: 'object',
    optional: true,
    properties: {
      bootable: { type: 'boolean', optional: true },
      mode: { type: 'string', optional: true },
      position: { type: 'string', optional: true }
    }
  }
}

create.resolve = {
  vm: ['vm', 'VM', 'administrate']
}

// -------------------------------------------------------------------

export async function resize ({ vdi, size }) {
  await this.getXapi(vdi).resizeVdi(vdi._xapiId, parseSize(size))
}

resize.description = 'resize an existing VDI'

resize.params = {
  id: { type: 'string' },
  size: { type: ['integer', 'string'] }
}

resize.resolve = {
  vdi: ['id', ['VDI', 'VDI-snapshot'], 'administrate']
}
