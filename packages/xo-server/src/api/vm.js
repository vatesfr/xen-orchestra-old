import concat from 'lodash/concat'
import { format } from 'json-rpc-peer'
import { ignoreErrors } from 'promise-toolbox'
import {
  forbiddenOperation,
  invalidParameters,
  noSuchObject,
  unauthorized,
} from 'xo-common/api-errors'

import { forEach, map, mapFilter, parseSize } from '../utils'

// ===================================================================

function checkPermissionOnSrs (vm, permission = 'operate') {
  const permissions = []
  forEach(vm.$VBDs, vbdId => {
    const vbd = this.getObject(vbdId, 'VBD')
    const vdiId = vbd.VDI

    if (vbd.is_cd_drive || !vdiId) {
      return
    }

    return permissions.push([this.getObject(vdiId, 'VDI').$SR, permission])
  })

  return this.hasPermissions(
    this.session.get('user_id'),
    permissions
  ).then(success => {
    if (!success) {
      throw unauthorized()
    }
  })
}

// ===================================================================

const extract = (obj, prop) => {
  const value = obj[prop]
  delete obj[prop]
  return value
}

// TODO: Implement ACLs
export async function create (params) {
  const { user } = this
  const resourceSet = extract(params, 'resourceSet')
  if (resourceSet === undefined && user.permission !== 'admin') {
    throw unauthorized()
  }

  const template = extract(params, 'template')
  params.template = template._xapiId

  const xapi = this.getXapi(template)

  const objectIds = [template.id]
  const limits = {
    cpus: template.CPUs.number,
    disk: 0,
    memory: template.memory.dynamic[1],
    vms: 1,
  }
  const vdiSizesByDevice = {}
  let highestDevice = -1
  forEach(xapi.getObject(template._xapiId).$VBDs, vbd => {
    let vdi
    highestDevice = Math.max(highestDevice, vbd.userdevice)
    if (vbd.type === 'Disk' && (vdi = vbd.$VDI)) {
      vdiSizesByDevice[vbd.userdevice] = +vdi.virtual_size
    }
  })

  const vdis = extract(params, 'VDIs')
  params.vdis =
    vdis &&
    map(vdis, vdi => {
      const sr = this.getObject(vdi.SR)
      const size = parseSize(vdi.size)

      objectIds.push(sr.id)
      limits.disk += size

      return {
        ...vdi,
        device: ++highestDevice,
        size,
        SR: sr._xapiId,
        type: vdi.type,
      }
    })

  const existingVdis = extract(params, 'existingDisks')
  params.existingVdis =
    existingVdis &&
    map(existingVdis, (vdi, userdevice) => {
      let size, sr
      if (vdi.size != null) {
        size = parseSize(vdi.size)
        vdiSizesByDevice[userdevice] = size
      }

      if (vdi.$SR) {
        sr = this.getObject(vdi.$SR)
        objectIds.push(sr.id)
      }

      return {
        ...vdi,
        size,
        $SR: sr && sr._xapiId,
      }
    })

  forEach(vdiSizesByDevice, size => (limits.disk += size))

  const vifs = extract(params, 'VIFs')
  params.vifs =
    vifs &&
    map(vifs, vif => {
      const network = this.getObject(vif.network)

      objectIds.push(network.id)

      return {
        mac: vif.mac,
        network: network._xapiId,
        ipv4_allowed: vif.allowedIpv4Addresses,
        ipv6_allowed: vif.allowedIpv6Addresses,
      }
    })

  const installation = extract(params, 'installation')
  params.installRepository = installation && installation.repository

  let checkLimits

  if (resourceSet) {
    await this.checkResourceSetConstraints(resourceSet, user.id, objectIds)
    checkLimits = async limits2 => {
      await this.allocateLimitsInResourceSet(limits, resourceSet)
      await this.allocateLimitsInResourceSet(limits2, resourceSet)
    }
  }

  const xapiVm = await xapi.createVm(template._xapiId, params, checkLimits)
  const vm = xapi.xo.addObject(xapiVm)

  if (resourceSet) {
    await Promise.all([
      params.share
        ? Promise.all(
          map((await this.getResourceSet(resourceSet)).subjects, subjectId =>
            this.addAcl(subjectId, vm.id, 'admin')
          )
        )
        : this.addAcl(user.id, vm.id, 'admin'),
      xapi.xo.setData(xapiVm.$id, 'resourceSet', resourceSet),
    ])
  }

  for (const vifId of vm.VIFs) {
    const vif = this.getObject(vifId, 'VIF')
    await this.allocIpAddresses(
      vifId,
      concat(vif.allowedIpv4Addresses, vif.allowedIpv6Addresses)
    ).catch(() => xapi.deleteVif(vif._xapiId))
  }

  if (params.bootAfterCreate) {
    ignoreErrors.call(xapi.startVm(vm._xapiId))
  }

  return vm.id
}

create.params = {
  affinityHost: { type: 'string', optional: true },

  bootAfterCreate: {
    type: 'boolean',
    optional: true,
  },

  cloudConfig: {
    type: 'string',
    optional: true,
  },

  coreOs: {
    type: 'boolean',
    optional: true,
  },

  clone: {
    type: 'boolean',
    optional: true,
  },

  coresPerSocket: {
    type: ['string', 'number'],
    optional: true,
  },

  resourceSet: {
    type: 'string',
    optional: true,
  },

  installation: {
    type: 'object',
    optional: true,
    properties: {
      method: { type: 'string' },
      repository: { type: 'string' },
    },
  },

  vgpuType: {
    type: 'string',
    optional: true,
  },

  gpuGroup: {
    type: 'string',
    optional: true,
  },

  // Name/description of the new VM.
  name_label: { type: 'string' },
  name_description: { type: 'string', optional: true },

  // PV Args
  pv_args: { type: 'string', optional: true },

  share: {
    type: 'boolean',
    optional: true,
  },

  // TODO: add the install repository!
  // VBD.insert/eject
  // Also for the console!

  // UUID of the template the VM will be created from.
  template: { type: 'string' },

  // Virtual interfaces to create for the new VM.
  VIFs: {
    optional: true,
    type: 'array',
    items: {
      type: 'object',
      properties: {
        // UUID of the network to create the interface in.
        network: { type: 'string' },

        mac: {
          optional: true, // Auto-generated per default.
          type: 'string',
        },

        allowedIpv4Addresses: {
          optional: true,
          type: 'array',
          items: { type: 'string' },
        },

        allowedIpv6Addresses: {
          optional: true,
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  },

  // Virtual disks to create for the new VM.
  VDIs: {
    optional: true, // If not defined, use the template parameters.
    type: 'array',
    items: {
      type: 'object',
      properties: {
        size: { type: ['integer', 'string'] },
        SR: { type: 'string' },
        type: { type: 'string' },
      },
    },
  },

  // TODO: rename to *existingVdis* or rename *VDIs* to *disks*.
  existingDisks: {
    optional: true,
    type: 'object',

    // Do not for a type object.
    items: {
      type: 'object',
      properties: {
        size: {
          type: ['integer', 'string'],
          optional: true,
        },
        $SR: {
          type: 'string',
          optional: true,
        },
      },
    },
  },
}

create.resolve = {
  template: ['template', 'VM-template', ''],
  vgpuType: ['vgpuType', 'vgpuType', ''],
  gpuGroup: ['gpuGroup', 'gpuGroup', ''],
}

// -------------------------------------------------------------------

async function delete_ ({
  delete_disks, // eslint-disable-line camelcase
  force,
  vm,

  deleteDisks = delete_disks,
}) {
  const xapi = this.getXapi(vm)

  this.getAllAcls().then(acls => {
    return Promise.all(
      mapFilter(acls, acl => {
        if (acl.object === vm.id) {
          return ignoreErrors.call(
            this.removeAcl(acl.subject, acl.object, acl.action)
          )
        }
      })
    )
  })

  // Update IP pools
  await Promise.all(
    map(vm.VIFs, vifId => {
      const vif = xapi.getObject(vifId)
      return ignoreErrors.call(
        this.allocIpAddresses(
          vifId,
          null,
          concat(vif.ipv4_allowed, vif.ipv6_allowed)
        )
      )
    })
  )

  // Update resource sets
  const resourceSet = xapi.xo.getData(vm._xapiId, 'resourceSet')
  if (resourceSet != null) {
    this.setVmResourceSet(vm._xapiId, null)::ignoreErrors()
  }

  return xapi.deleteVm(vm._xapiId, deleteDisks, force)
}

delete_.params = {
  id: { type: 'string' },

  deleteDisks: {
    optional: true,
    type: 'boolean',
  },

  force: {
    optional: true,
    type: 'boolean',
  },
}
delete_.resolve = {
  vm: ['id', ['VM', 'VM-snapshot', 'VM-template'], 'administrate'],
}

export { delete_ as delete }

// -------------------------------------------------------------------

export async function ejectCd ({ vm }) {
  await this.getXapi(vm).ejectCdFromVm(vm._xapiId)
}

ejectCd.params = {
  id: { type: 'string' },
}

ejectCd.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

export async function insertCd ({ vm, vdi, force }) {
  await this.getXapi(vm).insertCdIntoVm(vdi._xapiId, vm._xapiId, { force })
}

insertCd.params = {
  id: { type: 'string' },
  cd_id: { type: 'string' },
  force: { type: 'boolean' },
}

insertCd.resolve = {
  vm: ['id', 'VM', 'operate'],
  vdi: ['cd_id', 'VDI', 'view'],
}

// -------------------------------------------------------------------

export async function migrate ({
  vm,
  host,
  sr,
  mapVdisSrs,
  mapVifsNetworks,
  migrationNetwork,
}) {
  let mapVdisSrsXapi, mapVifsNetworksXapi
  const permissions = []

  if (mapVdisSrs) {
    mapVdisSrsXapi = {}
    forEach(mapVdisSrs, (srId, vdiId) => {
      const vdiXapiId = this.getObject(vdiId, 'VDI')._xapiId
      mapVdisSrsXapi[vdiXapiId] = this.getObject(srId, 'SR')._xapiId
      return permissions.push([srId, 'administrate'])
    })
  }

  if (mapVifsNetworks) {
    mapVifsNetworksXapi = {}
    forEach(mapVifsNetworks, (networkId, vifId) => {
      const vifXapiId = this.getObject(vifId, 'VIF')._xapiId
      mapVifsNetworksXapi[vifXapiId] = this.getObject(
        networkId,
        'network'
      )._xapiId
      return permissions.push([networkId, 'administrate'])
    })
  }

  if (!await this.hasPermissions(this.session.get('user_id'), permissions)) {
    throw unauthorized()
  }

  await this.getXapi(vm).migrateVm(
    vm._xapiId,
    this.getXapi(host),
    host._xapiId,
    {
      sr: sr && this.getObject(sr, 'SR')._xapiId,
      migrationNetworkId:
        migrationNetwork != null ? migrationNetwork._xapiId : undefined,
      mapVifsNetworks: mapVifsNetworksXapi,
      mapVdisSrs: mapVdisSrsXapi,
    }
  )
}

migrate.params = {
  // Identifier of the VM to migrate.
  vm: { type: 'string' },

  // Identifier of the host to migrate to.
  targetHost: { type: 'string' },

  // Identifier of the default SR to migrate to.
  sr: { type: 'string', optional: true },

  // Map VDIs IDs --> SRs IDs
  mapVdisSrs: { type: 'object', optional: true },

  // Map VIFs IDs --> Networks IDs
  mapVifsNetworks: { type: 'object', optional: true },

  // Identifier of the Network use for the migration
  migrationNetwork: { type: 'string', optional: true },
}

migrate.resolve = {
  vm: ['vm', 'VM', 'administrate'],
  host: ['targetHost', 'host', 'administrate'],
  migrationNetwork: ['migrationNetwork', 'network', 'administrate'],
}

// -------------------------------------------------------------------

export async function set (params) {
  const VM = extract(params, 'VM')
  const xapi = this.getXapi(VM)
  const vmId = VM._xapiId

  const resourceSetId = extract(params, 'resourceSet')

  if (resourceSetId !== undefined) {
    if (this.user.permission !== 'admin') {
      throw unauthorized()
    }

    await this.setVmResourceSet(vmId, resourceSetId)
  }

  const share = extract(params, 'share')
  const vmResourceSetId = VM.resourceSet

  if (share && vmResourceSetId === undefined) {
    throw new Error('the vm is not in a resource set')
  }

  if (share) {
    await this.shareVmResourceSet(vmId, vmResourceSetId)
  }

  return xapi.editVm(vmId, params, async (limits, vm) => {
    const resourceSet = xapi.xo.getData(vm, 'resourceSet')

    if (resourceSet) {
      try {
        return await this.allocateLimitsInResourceSet(limits, resourceSet)
      } catch (error) {
        // if the resource set no longer exist, behave as if the VM is free
        if (!noSuchObject.is(error)) {
          throw error
        }
      }
    }

    if (limits.cpuWeight && this.user.permission !== 'admin') {
      throw unauthorized()
    }
  })
}

set.params = {
  // Identifier of the VM to update.
  id: { type: 'string' },

  name_label: { type: 'string', optional: true },

  name_description: { type: 'string', optional: true },

  // TODO: provides better filtering of values for HA possible values: "best-
  // effort" meaning "try to restart this VM if possible but don't consider the
  // Pool to be overcommitted if this is not possible"; "restart" meaning "this
  // VM should be restarted"; "" meaning "do not try to restart this VM"
  high_availability: { type: 'boolean', optional: true },

  // Number of virtual CPUs to allocate.
  CPUs: { type: 'integer', optional: true },

  cpusMax: { type: ['integer', 'string'], optional: true },

  // Memory to allocate (in bytes).
  //
  // Note: static_min ≤ dynamic_min ≤ dynamic_max ≤ static_max
  memory: { type: ['integer', 'string'], optional: true },

  // Set dynamic_min
  memoryMin: { type: ['integer', 'string'], optional: true },

  // Set dynamic_max
  memoryMax: { type: ['integer', 'string'], optional: true },

  // Set static_max
  memoryStaticMax: { type: ['integer', 'string'], optional: true },

  // Kernel arguments for PV VM.
  PV_args: { type: 'string', optional: true },

  cpuWeight: { type: ['integer', 'null'], optional: true },

  cpuCap: { type: ['integer', 'null'], optional: true },

  affinityHost: { type: ['string', 'null'], optional: true },

  // Switch from Cirrus video adaptor to VGA adaptor
  vga: { type: 'string', optional: true },

  videoram: { type: ['string', 'number'], optional: true },

  coresPerSocket: { type: ['string', 'number', 'null'], optional: true },

  // Move the vm In to/Out of Self Service
  resourceSet: { type: ['string', 'null'], optional: true },

  share: { type: 'boolean', optional: true },
}

set.resolve = {
  VM: ['id', ['VM', 'VM-snapshot', 'VM-template'], 'administrate'],
}

// -------------------------------------------------------------------

export async function restart ({ vm, force }) {
  const xapi = this.getXapi(vm)

  if (force) {
    await xapi.call('VM.hard_reboot', vm._xapiRef)
  } else {
    await xapi.call('VM.clean_reboot', vm._xapiRef)
  }
}

restart.params = {
  id: { type: 'string' },
  force: { type: 'boolean' },
}

restart.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

// TODO: implement resource sets
export async function clone ({ vm, name, full_copy: fullCopy }) {
  await checkPermissionOnSrs.call(this, vm)

  return this.getXapi(vm)
    .cloneVm(vm._xapiRef, {
      nameLabel: name,
      fast: !fullCopy,
    })
    .then(vm => vm.$id)
}

clone.params = {
  id: { type: 'string' },
  name: { type: 'string' },
  full_copy: { type: 'boolean' },
}

clone.resolve = {
  // TODO: is it necessary for snapshots?
  vm: ['id', 'VM', 'administrate'],
}

// -------------------------------------------------------------------

// TODO: implement resource sets
export async function copy ({ compress, name: nameLabel, sr, vm }) {
  if (vm.$pool === sr.$pool) {
    if (vm.power_state === 'Running') {
      await checkPermissionOnSrs.call(this, vm)
    }

    return this.getXapi(vm)
      .copyVm(vm._xapiId, sr._xapiId, {
        nameLabel,
      })
      .then(vm => vm.$id)
  }

  return this.getXapi(vm)
    .remoteCopyVm(vm._xapiId, this.getXapi(sr), sr._xapiId, {
      compress,
      nameLabel,
    })
    .then(({ vm }) => vm.$id)
}

copy.params = {
  compress: {
    type: 'boolean',
    optional: true,
  },
  name: {
    type: 'string',
    optional: true,
  },
  vm: { type: 'string' },
  sr: { type: 'string' },
}

copy.resolve = {
  vm: ['vm', ['VM', 'VM-snapshot'], 'administrate'],
  sr: ['sr', 'SR', 'operate'],
}

// -------------------------------------------------------------------

export async function convertToTemplate ({ vm }) {
  // Convert to a template requires pool admin permission.
  if (
    !await this.hasPermissions(this.session.get('user_id'), [
      [vm.$pool, 'administrate'],
    ])
  ) {
    throw unauthorized()
  }

  await this.getXapi(vm).call('VM.set_is_a_template', vm._xapiRef, true)
}

convertToTemplate.params = {
  id: { type: 'string' },
}

convertToTemplate.resolve = {
  vm: ['id', ['VM', 'VM-snapshot'], 'administrate'],
}

// TODO: remove when no longer used.
export { convertToTemplate as convert }

// -------------------------------------------------------------------

// TODO: implement resource sets
export async function snapshot ({
  vm,
  name = `${vm.name_label}_${new Date().toISOString()}`,
}) {
  await checkPermissionOnSrs.call(this, vm)

  return (await this.getXapi(vm).snapshotVm(vm._xapiRef, name)).$id
}

snapshot.params = {
  id: { type: 'string' },
  name: { type: 'string', optional: true },
}

snapshot.resolve = {
  vm: ['id', 'VM', 'administrate'],
}

// -------------------------------------------------------------------

export function rollingDeltaBackup ({
  vm,
  remote,
  tag,
  depth,
  retention = depth,
}) {
  return this.rollingDeltaVmBackup({
    vm,
    remoteId: remote,
    tag,
    retention,
  })
}

rollingDeltaBackup.params = {
  id: { type: 'string' },
  remote: { type: 'string' },
  tag: { type: 'string' },
  retention: { type: ['string', 'number'], optional: true },
  // This parameter is deprecated. It used to support the old saved backups jobs.
  depth: { type: ['string', 'number'], optional: true },
}

rollingDeltaBackup.resolve = {
  vm: ['id', ['VM', 'VM-snapshot'], 'administrate'],
}

rollingDeltaBackup.permission = 'admin'

// -------------------------------------------------------------------

export function importDeltaBackup ({ sr, remote, filePath, mapVdisSrs }) {
  const mapVdisSrsXapi = {}

  forEach(mapVdisSrs, (srId, vdiId) => {
    mapVdisSrsXapi[vdiId] = this.getObject(srId, 'SR')._xapiId
  })

  return this.importDeltaVmBackup({
    sr,
    remoteId: remote,
    filePath,
    mapVdisSrs: mapVdisSrsXapi,
  })
}

importDeltaBackup.params = {
  sr: { type: 'string' },
  remote: { type: 'string' },
  filePath: { type: 'string' },
  // Map VDIs UUIDs --> SRs IDs
  mapVdisSrs: { type: 'object', optional: true },
}

importDeltaBackup.resolve = {
  sr: ['sr', 'SR', 'operate'],
}

importDeltaBackup.permission = 'admin'

// -------------------------------------------------------------------

export function deltaCopy ({ force, vm, retention, sr }) {
  return this.deltaCopyVm(vm, sr, force, retention)
}

deltaCopy.params = {
  force: { type: 'boolean', optional: true },
  id: { type: 'string' },
  retention: { type: 'number', optional: true },
  sr: { type: 'string' },
}

deltaCopy.resolve = {
  vm: ['id', 'VM', 'operate'],
  sr: ['sr', 'SR', 'operate'],
}

// -------------------------------------------------------------------

export async function rollingSnapshot ({ vm, tag, depth, retention = depth }) {
  await checkPermissionOnSrs.call(this, vm)
  return this.rollingSnapshotVm(vm, tag, retention)
}

rollingSnapshot.params = {
  id: { type: 'string' },
  tag: { type: 'string' },
  retention: { type: 'number', optional: true },
  // This parameter is deprecated. It used to support the old saved backups jobs.
  depth: { type: 'number', optional: true },
}

rollingSnapshot.resolve = {
  vm: ['id', 'VM', 'administrate'],
}

rollingSnapshot.description =
  'Snapshots a VM with a tagged name, and removes the oldest snapshot with the same tag according to retention'

// -------------------------------------------------------------------

export function backup ({ vm, remoteId, file, compress }) {
  return this.backupVm({ vm, remoteId, file, compress })
}

backup.permission = 'admin'

backup.params = {
  id: { type: 'string' },
  remoteId: { type: 'string' },
  file: { type: 'string' },
  compress: { type: 'boolean', optional: true },
}

backup.resolve = {
  vm: ['id', 'VM', 'administrate'],
}

backup.description = 'Exports a VM to the file system'

// -------------------------------------------------------------------

export function importBackup ({ remote, file, sr }) {
  return this.importVmBackup(remote, file, sr)
}

importBackup.permission = 'admin'
importBackup.description =
  'Imports a VM into host, from a file found in the chosen remote'
importBackup.params = {
  remote: { type: 'string' },
  file: { type: 'string' },
  sr: { type: 'string' },
}

importBackup.resolve = {
  sr: ['sr', 'SR', 'operate'],
}

importBackup.permission = 'admin'

// -------------------------------------------------------------------

export function rollingBackup ({
  vm,
  remoteId,
  tag,
  depth,
  retention = depth,
  compress,
}) {
  return this.rollingBackupVm({
    vm,
    remoteId,
    tag,
    retention,
    compress,
  })
}

rollingBackup.permission = 'admin'

rollingBackup.params = {
  id: { type: 'string' },
  remoteId: { type: 'string' },
  tag: { type: 'string' },
  retention: { type: 'number', optional: true },
  // This parameter is deprecated. It used to support the old saved backups jobs.
  depth: { type: 'number', optional: true },
  compress: { type: 'boolean', optional: true },
}

rollingBackup.resolve = {
  vm: ['id', ['VM', 'VM-snapshot'], 'administrate'],
}

rollingBackup.description =
  'Exports a VM to the file system with a tagged name, and removes the oldest backup with the same tag according to retention'

// -------------------------------------------------------------------

export function rollingDrCopy ({
  vm,
  pool,
  sr,
  tag,
  depth,
  retention = depth,
  deleteOldBackupsFirst,
}) {
  if (sr === undefined) {
    if (pool === undefined) {
      throw invalidParameters('either pool or sr param should be specified')
    }

    if (vm.$pool === pool.id) {
      throw forbiddenOperation(
        'Disaster Recovery attempts to copy on the same pool'
      )
    }

    sr = this.getObject(pool.default_SR, 'SR')
  }

  return this.rollingDrCopyVm({
    vm,
    sr,
    tag,
    retention,
    deleteOldBackupsFirst,
  })
}

rollingDrCopy.params = {
  retention: { type: 'number', optional: true },
  // This parameter is deprecated. It used to support the old saved backups jobs.
  depth: { type: 'number', optional: true },
  id: { type: 'string' },
  pool: { type: 'string', optional: true },
  sr: { type: 'string', optional: true },
  tag: { type: 'string' },
  deleteOldBackupsFirst: { type: 'boolean', optional: true },
}

rollingDrCopy.resolve = {
  vm: ['id', ['VM', 'VM-snapshot'], 'administrate'],
  pool: ['pool', 'pool', 'administrate'],
  sr: ['sr', 'SR', 'administrate'],
}

rollingDrCopy.description =
  'Copies a VM to a different pool, with a tagged name, and removes the oldest VM with the same tag from this pool, according to retention'

// -------------------------------------------------------------------

export function start ({ vm, force }) {
  return this.getXapi(vm).startVm(vm._xapiId, force)
}

start.params = {
  force: { type: 'boolean', optional: true },
  id: { type: 'string' },
}

start.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

// TODO: implements timeout.
// - if !force → clean shutdown
// - if force is true → hard shutdown
// - if force is integer → clean shutdown and after force seconds, hard shutdown.
export async function stop ({ vm, force }) {
  const xapi = this.getXapi(vm)

  // Hard shutdown
  if (force) {
    await xapi.call('VM.hard_shutdown', vm._xapiRef)
    return
  }

  // Clean shutdown
  try {
    await xapi.call('VM.clean_shutdown', vm._xapiRef)
  } catch (error) {
    const { code } = error
    if (
      code === 'VM_MISSING_PV_DRIVERS' ||
      code === 'VM_LACKS_FEATURE_SHUTDOWN'
    ) {
      throw invalidParameters('clean shutdown requires PV drivers')
    }

    throw error
  }
}

stop.params = {
  id: { type: 'string' },
  force: { type: 'boolean', optional: true },
}

stop.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

export async function suspend ({ vm }) {
  await this.getXapi(vm).call('VM.suspend', vm._xapiRef)
}

suspend.params = {
  id: { type: 'string' },
}

suspend.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

export function resume ({ vm }) {
  return this.getXapi(vm).resumeVm(vm._xapiId)
}

resume.params = {
  id: { type: 'string' },
}

resume.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

export function revert ({ snapshot, snapshotBefore }) {
  return this.getXapi(snapshot).revertVm(snapshot._xapiId, snapshotBefore)
}

revert.params = {
  id: { type: 'string' },
  snapshotBefore: { type: 'boolean', optional: true },
}

revert.resolve = {
  snapshot: ['id', 'VM-snapshot', 'administrate'],
}

// -------------------------------------------------------------------

export async function handleExport (req, res, { xapi, id, compress }) {
  const stream = await xapi.exportVm(id, {
    compress: compress != null ? compress : true,
  })
  res.on('close', () => stream.cancel())
  // Remove the filename as it is already part of the URL.
  stream.headers['content-disposition'] = 'attachment'

  res.writeHead(
    stream.statusCode,
    stream.statusMessage != null ? stream.statusMessage : '',
    stream.headers
  )
  stream.pipe(res)
}

// TODO: integrate in xapi.js
async function export_ ({ vm, compress }) {
  if (vm.power_state === 'Running') {
    await checkPermissionOnSrs.call(this, vm)
  }

  const data = {
    xapi: this.getXapi(vm),
    id: vm._xapiId,
    compress,
  }

  return {
    $getFrom: await this.registerHttpRequest(handleExport, data, {
      suffix: encodeURI(`/${vm.name_label}.xva`),
    }),
  }
}

export_.params = {
  vm: { type: 'string' },
  compress: { type: 'boolean', optional: true },
}

export_.resolve = {
  vm: ['vm', ['VM', 'VM-snapshot'], 'administrate'],
}

export { export_ as export }

// -------------------------------------------------------------------

export async function handleVmImport (req, res, { data, srId, type, xapi }) {
  // Timeout seems to be broken in Node 4.
  // See https://github.com/nodejs/node/issues/3319
  req.setTimeout(43200000) // 12 hours

  try {
    const vm = await xapi.importVm(req, { data, srId, type })
    res.end(format.response(0, vm.$id))
  } catch (e) {
    res.writeHead(500)
    res.end(format.error(0, new Error(e.message)))
  }
}

// TODO: "sr_id" can be passed in URL to target a specific SR
async function import_ ({ data, host, sr, type }) {
  let xapi
  if (data && type === 'xva') {
    throw invalidParameters('unsupported field data for the file type xva')
  }

  if (!sr) {
    if (!host) {
      throw invalidParameters('you must provide either host or SR')
    }

    xapi = this.getXapi(host)
    sr = xapi.pool.$default_SR
    if (!sr) {
      throw invalidParameters('there is not default SR in this pool')
    }

    // FIXME: must have administrate permission on default SR.
  } else {
    xapi = this.getXapi(sr)
  }

  return {
    $sendTo: await this.registerHttpRequest(handleVmImport, {
      data,
      srId: sr._xapiId,
      type,
      xapi,
    }),
  }
}

import_.params = {
  data: {
    type: 'object',
    optional: true,
    properties: {
      descriptionLabel: { type: 'string' },
      disks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            capacity: { type: 'integer' },
            descriptionLabel: { type: 'string' },
            nameLabel: { type: 'string' },
            path: { type: 'string' },
            position: { type: 'integer' },
          },
        },
        optional: true,
      },
      memory: { type: 'integer' },
      nameLabel: { type: 'string' },
      nCpus: { type: 'integer' },
      networks: {
        type: 'array',
        items: { type: 'string' },
        optional: true,
      },
    },
  },
  host: { type: 'string', optional: true },
  type: { type: 'string', optional: true },
  sr: { type: 'string', optional: true },
}

import_.resolve = {
  host: ['host', 'host', 'administrate'],
  sr: ['sr', 'SR', 'administrate'],
}

export { import_ as import }

// -------------------------------------------------------------------

// FIXME: if position is used, all other disks after this position
// should be shifted.
export async function attachDisk ({ vm, vdi, position, mode, bootable }) {
  await this.getXapi(vm).createVbd({
    bootable,
    mode,
    userdevice: position,
    vdi: vdi._xapiId,
    vm: vm._xapiId,
  })
}

attachDisk.params = {
  bootable: {
    type: 'boolean',
    optional: true,
  },
  mode: { type: 'string', optional: true },
  position: { type: 'string', optional: true },
  vdi: { type: 'string' },
  vm: { type: 'string' },
}

attachDisk.resolve = {
  vm: ['vm', 'VM', 'administrate'],
  vdi: ['vdi', 'VDI', 'administrate'],
}

// -------------------------------------------------------------------

// TODO: implement resource sets
export async function createInterface ({
  vm,
  network,
  position,
  mac,
  allowedIpv4Addresses,
  allowedIpv6Addresses,
}) {
  const { resourceSet } = vm
  if (resourceSet != null) {
    await this.checkResourceSetConstraints(resourceSet, this.user.id, [ network.id ])
  } else if (!(await this.hasPermissions(this.user.id, [ [ network.id, 'view' ] ]))) {
    throw unauthorized()
  }

  let ipAddresses
  const vif = await this.getXapi(vm).createVif(vm._xapiId, network._xapiId, {
    mac,
    position,
    ipv4_allowed: allowedIpv4Addresses,
    ipv6_allowed: allowedIpv6Addresses,
  })

  const { push } = (ipAddresses = [])
  if (allowedIpv4Addresses) {
    push.apply(ipAddresses, allowedIpv4Addresses)
  }
  if (allowedIpv6Addresses) {
    push.apply(ipAddresses, allowedIpv6Addresses)
  }
  if (ipAddresses.length) {
    ignoreErrors.call(this.allocIpAddresses(vif.$id, ipAddresses))
  }

  return vif.$id
}

createInterface.params = {
  vm: { type: 'string' },
  network: { type: 'string' },
  position: { type: ['integer', 'string'], optional: true },
  mac: { type: 'string', optional: true },
  allowedIpv4Addresses: {
    type: 'array',
    items: {
      type: 'string',
    },
    optional: true,
  },
  allowedIpv6Addresses: {
    type: 'array',
    items: {
      type: 'string',
    },
    optional: true,
  },
}

createInterface.resolve = {
  // Not compatible with resource sets.
  // FIXME: find a workaround.
  network: ['network', 'network', ''],
  vm: ['vm', 'VM', 'administrate'],
}

// -------------------------------------------------------------------

export async function attachPci ({ vm, pciId }) {
  const xapi = this.getXapi(vm)

  await xapi.call('VM.add_to_other_config', vm._xapiRef, 'pci', pciId)
}

attachPci.params = {
  vm: { type: 'string' },
  pciId: { type: 'string' },
}

attachPci.resolve = {
  vm: ['vm', 'VM', 'administrate'],
}

// -------------------------------------------------------------------

export async function detachPci ({ vm }) {
  const xapi = this.getXapi(vm)

  await xapi.call('VM.remove_from_other_config', vm._xapiRef, 'pci')
}

detachPci.params = {
  vm: { type: 'string' },
}

detachPci.resolve = {
  vm: ['vm', 'VM', 'administrate'],
}
// -------------------------------------------------------------------

export function stats ({ vm, granularity }) {
  return this.getXapiVmStats(vm, granularity)
}

stats.description = 'returns statistics about the VM'

stats.params = {
  id: { type: 'string' },
  granularity: {
    type: 'string',
    optional: true,
  },
}

stats.resolve = {
  vm: ['id', ['VM', 'VM-snapshot'], 'view'],
}

// -------------------------------------------------------------------

export async function setBootOrder ({ vm, order }) {
  const xapi = this.getXapi(vm)

  order = { order }
  if (vm.virtualizationMode === 'hvm') {
    await xapi.call('VM.set_HVM_boot_params', vm._xapiRef, order)
    return
  }

  throw invalidParameters('You can only set the boot order on a HVM guest')
}

setBootOrder.params = {
  vm: { type: 'string' },
  order: { type: 'string' },
}

setBootOrder.resolve = {
  vm: ['vm', 'VM', 'operate'],
}

// -------------------------------------------------------------------

export function recoveryStart ({ vm }) {
  return this.getXapi(vm).startVmOnCd(vm._xapiId)
}

recoveryStart.params = {
  id: { type: 'string' },
}

recoveryStart.resolve = {
  vm: ['id', 'VM', 'operate'],
}

// -------------------------------------------------------------------

export function getCloudInitConfig ({ template }) {
  return this.getXapi(template).getCloudInitConfig(template._xapiId)
}

getCloudInitConfig.params = {
  template: { type: 'string' },
}

getCloudInitConfig.resolve = {
  template: ['template', 'VM-template', 'administrate'],
}

// -------------------------------------------------------------------

export async function createCloudInitConfigDrive ({ vm, sr, config, coreos }) {
  const xapi = this.getXapi(vm)
  if (coreos) {
    // CoreOS is a special CloudConfig drive created by XS plugin
    await xapi.createCoreOsCloudInitConfigDrive(vm._xapiId, sr._xapiId, config)
  } else {
    // use generic Cloud Init drive
    await xapi.createCloudInitConfigDrive(vm._xapiId, sr._xapiId, config)
  }
}

createCloudInitConfigDrive.params = {
  vm: { type: 'string' },
  sr: { type: 'string' },
  config: { type: 'string' },
}

createCloudInitConfigDrive.resolve = {
  vm: ['vm', 'VM', 'administrate'],

  // Not compatible with resource sets.
  // FIXME: find a workaround.
  sr: ['sr', 'SR', ''], // 'operate' ]
}

// -------------------------------------------------------------------

export async function createVgpu ({ vm, gpuGroup, vgpuType }) {
  // TODO: properly handle device. Can a VM have 2 vGPUS?
  await this.getXapi(vm).createVgpu(
    vm._xapiId,
    gpuGroup._xapiId,
    vgpuType._xapiId
  )
}

createVgpu.params = {
  vm: { type: 'string' },
  gpuGroup: { type: 'string' },
  vgpuType: { type: 'string' },
}

createVgpu.resolve = {
  vm: ['vm', 'VM', 'administrate'],
  gpuGroup: ['gpuGroup', 'gpuGroup', ''],
  vgpuType: ['vgpuType', 'vgpuType', ''],
}

// -------------------------------------------------------------------

export async function deleteVgpu ({ vgpu }) {
  await this.getXapi(vgpu).deleteVgpu(vgpu._xapiId)
}

deleteVgpu.params = {
  vgpu: { type: 'string' },
}

deleteVgpu.resolve = {
  vgpu: ['vgpu', 'vgpu', ''],
}
