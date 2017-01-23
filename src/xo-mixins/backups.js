import deferrable from 'golike-defer'
import escapeStringRegexp from 'escape-string-regexp'
import eventToPromise from 'event-to-promise'
import execa from 'execa'
import splitLines from 'split-lines'
import { createParser as createPairsParser } from 'parse-pairs'
import { createReadStream, readdir, stat } from 'fs'
import { utcFormat } from 'd3-time-format'
import {
  basename,
  dirname
} from 'path'
import {
  endsWith,
  filter,
  find,
  includes,
  once,
  orderBy,
  startsWith,
  trim
} from 'lodash'

import { lvs, pvs } from '../lvm'
import {
  forEach,
  mapFilter,
  mapToArray,
  noop,
  pCatch,
  pFinally,
  pFromCallback,
  resolveSubpath,
  safeDateFormat,
  safeDateParse,
  tmpDir
} from '../utils'

// ===================================================================

const REMOTE_BACKUPS_PATH = '/'

const shortDate = utcFormat('%Y-%m-%d')

const toTimestamp = date => date && Math.round(date.getTime() / 1000)

// -------------------------------------------------------------------

const parseVmBackupPath = name => {
  const base = basename(name)
  let baseMatches

  baseMatches = /^([^_]+)_([^_]+)_(.+)\.xva$/.exec(base)
  if (baseMatches) {
    return {
      datetime: toTimestamp(safeDateParse(baseMatches[1])),
      id: name,
      name: baseMatches[3],
      tag: baseMatches[2],
      type: 'xva'
    }
  }

  let dirMatches
  if (
    (baseMatches = /^([^_]+)_(.+)\.json$/.exec(base)) &&
    (dirMatches = /^vm_delta_([^_]+)_(.+)$/.exec(basename(dirname(name))))
  ) {
    return {
      datetime: toTimestamp(safeDateParse(baseMatches[1])),
      id: name,
      name: baseMatches[2],
      tag: dirMatches[1],
      type: 'delta',
      uuid: dirMatches[2]
    }
  }

  throw new Error('invalid VM backup filename')
}

// -------------------------------------------------------------------

const listPartitions = (() => {
  const IGNORED = {}
  forEach([
    // https://github.com/jhermsmeier/node-mbr/blob/master/lib/partition.js#L38
    0x05, 0x0F, 0x85, 0x15, 0x91, 0x9B, 0x5E, 0x5F, 0xCF, 0xD5, 0xC5,

    0x82 // swap
  ], type => {
    IGNORED[type] = true
  })

  const TYPES = {
    0x7: 'NTFS',
    0x83: 'linux',
    0xc: 'FAT'
  }

  const parseLine = createPairsParser({
    keyTransform: key => key === 'UUID'
      ? 'id'
      : key.toLowerCase(),
    valueTransform: (value, key) => key === 'start' || key === 'size'
      ? +value
      : key === 'type'
        ? TYPES[+value] || value
        : value
  })

  return device => execa.stdout('partx', [
    '--bytes',
    '--output=NR,START,SIZE,NAME,UUID,TYPE',
    '--pairs',
    device.path
  ]).then(stdout => mapFilter(splitLines(stdout), line => {
    const partition = parseLine(line)
    const { type } = partition
    if (type != null && !IGNORED[+type]) {
      return partition
    }
  }))
})()

// handle LVM logical volumes automatically
const listPartitions2 = device => listPartitions(device).then(partitions => {
  const partitions2 = []
  const promises = []
  forEach(partitions, partition => {
    if (+partition.type === 0x8e) {
      promises.push(mountLvmPv(device, partition).then(device => {
        const promise = listLvmLvs(device).then(lvs => {
          forEach(lvs, lv => {
            partitions2.push({
              name: lv.lv_name,
              size: +lv.lv_size,
              id: `${partition.id}/${lv.vg_name}/${lv.lv_name}`
            })
          })
        })
        promise::pFinally(device.unmount)
        return promise
      }))
    } else {
      partitions2.push(partition)
    }
  })
  return Promise.all(promises).then(() => partitions2)
})

const mountPartition = (device, partitionId) => Promise.all([
  partitionId != null && listPartitions(device),
  tmpDir()
]).then(([ partitions, path ]) => {
  const options = [
    'loop',
    'ro'
  ]

  if (partitions) {
    const partition = find(partitions, { id: partitionId })

    const { start } = partition
    if (start != null) {
      options.push(`offset=${start * 512}`)
    }
  }

  const mount = options => execa('mount', [
    `--options=${options.join(',')}`,
    `--source=${device.path}`,
    `--target=${path}`
  ])

  // `noload` option is used for ext3/ext4, if it fails it might
  // `be another fs, try without
  return mount([ ...options, 'noload' ]).catch(() =>
    mount(options)
  ).then(() => ({
    path,
    unmount: once(() => execa('umount', [ '--lazy', path ]))
  }), error => {
    console.log(error)

    throw error
  })
})

// handle LVM logical volumes automatically
const mountPartition2 = (device, partitionId) => {
  if (
    partitionId == null ||
    !includes(partitionId, '/')
  ) {
    return mountPartition(device, partitionId)
  }

  const [ pvId, vgName, lvName ] = partitionId.split('/')

  return listPartitions(device).then(partitions =>
    find(partitions, { id: pvId })
  ).then(pvId => mountLvmPv(device, pvId)).then(device1 =>
    execa('vgchange', [ '-ay', vgName ]).then(() =>
      lvs([ 'lv_name', 'lv_path' ], vgName).then(lvs =>
        find(lvs, { lv_name: lvName }).lv_path
      )
    ).then(path =>
      mountPartition({ path }).then(device2 => ({
        ...device2,
        unmount: () => device2.unmount().then(device1.unmount)
      }))
    ).catch(error => device1.unmount().then(() => {
      throw error
    }))
  )
}

// -------------------------------------------------------------------

const listLvmLvs = device => pvs([
  'lv_name',
  'lv_path',
  'lv_size',
  'vg_name'
], device.path).then(pvs => filter(pvs, 'lv_name'))

const mountLvmPv = (device, partition) => {
  const args = []
  if (partition) {
    args.push('-o', partition.start * 512)
  }
  args.push(
    '--show',
    '-f',
    device.path
  )

  return execa.stdout('losetup', args).then(stdout => {
    const path = trim(stdout)
    return {
      path,
      unmount: once(() => Promise.all([
        execa('losetup', [ '-d', path ]),
        pvs('vg_name', path).then(vgNames => execa('vgchange', [
          '-an',
          ...vgNames
        ]))
      ]))
    }
  })
}

// ===================================================================

export default class Backups {
  constructor (xo) {
    this._xo = xo

    // clean any LVM volumes that might have not been properly
    // unmounted
    xo.on('start', () => Promise.all([
      execa('losetup', [ '-D' ]),
      execa('vgchange', [ '-an' ])
    ]).then(() =>
      execa('pvscan', [ '--cache' ])
    ))
  }

  // -----------------------------------------------------------------

  @deferrable.onFailure
  async deltaCopyVm ($onFailure, srcVm, targetSr) {
    const srcXapi = this._xo.getXapi(srcVm)
    const targetXapi = this._xo.getXapi(targetSr)

    // Get Xen objects from XO objects.
    srcVm = srcXapi.getObject(srcVm._xapiId)
    targetSr = targetXapi.getObject(targetSr._xapiId)

    // 1. Find the local base for this SR (if any).
    const TAG_LAST_BASE_DELTA = `xo:base_delta:${targetSr.uuid}`
    const localBaseUuid = (id => {
      if (id != null) {
        const base = srcXapi.getObject(id, null)
        return base && base.uuid
      }
    })(srcVm.other_config[TAG_LAST_BASE_DELTA])

    // 2. Copy.
    const dstVm = await (async () => {
      const delta = await srcXapi.exportDeltaVm(srcVm.$id, localBaseUuid, {
        snapshotNameLabel: `XO_DELTA_EXPORT: ${targetSr.name_label} (${targetSr.uuid})`
      })
      $onFailure(async () => {
        await Promise.all(mapToArray(
          delta.streams,
          stream => stream.cancel()
        ))

        return srcXapi.deleteVm(delta.vm.uuid)
      })

      delta.vm.name_label += ` (${shortDate(Date.now())})`

      const promise = targetXapi.importDeltaVm(
        delta,
        {
          deleteBase: true, // Remove the remote base.
          srId: targetSr.$id
        }
      )

      // Once done, (asynchronously) remove the (now obsolete) local
      // base.
      if (localBaseUuid) {
        promise.then(() => srcXapi.deleteVm(localBaseUuid))::pCatch(noop)
      }

      // (Asynchronously) Identify snapshot as future base.
      promise.then(() => {
        return srcXapi._updateObjectMapProperty(srcVm, 'other_config', {
          [TAG_LAST_BASE_DELTA]: delta.vm.uuid
        })
      })::pCatch(noop)

      return promise
    })()

    // 5. Return the identifier of the new XO VM object.
    return targetXapi.addObject(dstVm).id
  }

  // -----------------------------------------------------------------

  async rollingDrCopyVm ({vm, sr, tag, retention}) {
    tag = 'DR_' + tag
    const reg = new RegExp('^' + escapeStringRegexp(`${vm.name_label}_${tag}_`) + '[0-9]{8}T[0-9]{6}Z$')

    const targetXapi = this._xo.getXapi(sr)
    sr = targetXapi.getObject(sr._xapiId)
    const sourceXapi = this._xo.getXapi(vm)
    vm = sourceXapi.getObject(vm._xapiId)

    const vms = {}
    forEach(sr.$VDIs, vdi => {
      const vbds = vdi.$VBDs
      const vm = vbds && vbds[0] && vbds[0].$VM
      if (vm && reg.test(vm.name_label)) {
        vms[vm.$id] = vm
      }
    })
    const olderCopies = orderBy(vms, 'name_label')

    const copyName = `${vm.name_label}_${tag}_${safeDateFormat(new Date())}`
    const drCopy = await sourceXapi.remoteCopyVm(vm.$id, targetXapi, sr.$id, {
      nameLabel: copyName
    })
    await targetXapi.addTag(drCopy.$id, 'Disaster Recovery')

    const n = 1 - retention
    await Promise.all(mapToArray(n ? olderCopies.slice(0, n) : olderCopies, vm =>
      // Do not consider a failure to delete an old copy as a fatal error.
      targetXapi.deleteVm(vm.$id)::pCatch(noop)
    ))
  }

  // -----------------------------------------------------------------

  async rollingSnapshotVm (vm, tag, retention) {
    const xapi = this._xo.getXapi(vm)
    const { $id, $snapshots } = xapi.getObject(vm._xapiId)

    await xapi.snapshotVm(
      $id,
      `rollingSnapshot_${safeDateFormat(new Date())}_${tag}_${vm.name_label}`
    )

    // snapshots to remove: remove all rolling snapshots but the last retention-th
    const reg = new RegExp('^rollingSnapshot_[^_]+_' + escapeStringRegexp(tag) + '_')
    const snapshots = orderBy(
      filter($snapshots, snapshot => reg.test(snapshot.name_label)),
      'name_label'
    )
    snapshots.length = Math.min(0, 1 + snapshots.length - retention)
    await Promise.all(mapToArray(
      snapshots,
      snapshot => xapi.deleteVm(snapshot.$id))::pCatch(noop)
    )
  }

  // -----------------------------------------------------------------

  async listVmBackups (remoteId) {
    const handler = await this._xo.getRemoteHandler(remoteId)

    const backups = []

    await Promise.all(mapToArray(await handler.list(REMOTE_BACKUPS_PATH), entry => {
      if (endsWith(entry, '.xva')) {
        backups.push(parseVmBackupPath(entry))
      } else if (startsWith(entry, 'vm_delta_')) {
        return handler.list(`${REMOTE_BACKUPS_PATH}/${entry}`).then(children => Promise.all(mapToArray(children, child => {
          if (endsWith(child, '.json')) {
            const path = `${REMOTE_BACKUPS_PATH}/${entry}/${child}`

            const record = parseVmBackupPath(path)
            backups.push(record)

            return handler.readFile(path).then(data => {
              record.disks = mapToArray(JSON.parse(data).vdis, vdi => ({
                id: `${entry}/${vdi.xoPath}`,
                name: vdi.name_label,
                uuid: vdi.uuid
              }))
            }).catch(noop)
          }
        })))
      }
    }))

    return backups
  }

  // -----------------------------------------------------------------

  async _backupVm (vm, handler, file, opts) {
    const targetStream = await handler.createOutputStream(file)
    const promise = eventToPromise(targetStream, 'finish')

    const sourceStream = await this._xo.getXapi(vm).exportVm(vm._xapiId, opts)
    sourceStream.pipe(targetStream)

    return promise
  }

  async backupVm ({vm, remoteId, file, compress, onlyMetadata}) {
    const handler = await this._xo.getRemoteHandler(remoteId)
    return this._backupVm(vm, handler, file, {compress, onlyMetadata})
  }

  async rollingBackupVm ({vm, remoteId, tag, retention, compress, onlyMetadata}) {
    const handler = await this._xo.getRemoteHandler(remoteId)

    await this._backupVm(
      vm,
      handler,
      `${safeDateFormat(new Date())}_${tag}_${vm.name_label}.xva`,
      { compress, onlyMetadata }
    )

    const reg = new RegExp('^[^_]+_' + escapeStringRegexp(`${tag}_${vm.name_label}.xva`))
    const backups = (
      filter(await handler.list(REMOTE_BACKUPS_PATH), filename => reg.test(filename))
    ).sort()
    backups.length = Math.min(0, backups.length - retention)
    await Promise.all(mapToArray(
      backups,
      backup => handler.link(`${REMOTE_BACKUPS_PATH}/${backup}`)
    ))
  }

  async importVmBackup (remoteId, file, sr) {
    const handler = await this._xo.getRemoteHandler(remoteId)
    const stream = await handler.createReadStream(file)
    const xapi = this._xo.getXapi(sr)

    const vm = await xapi.importVm(stream, { srId: sr._xapiId })

    const { datetime } = parseVmBackupPath(file)
    await Promise.all([
      xapi.addTag(vm.$id, 'restored from backup'),
      xapi.editVm(vm.$id, {
        name_label: `${vm.name_label} (${shortDate(datetime * 1e3)})`
      })
    ])

    return xapi.addObject(vm).id
  }

  // -----------------------------------------------------------------

  @deferrable.onFailure
  async rollingDeltaVmBackup ($onFailure, { vm, remoteId, tag, retention }) {
    const handler = await this._xo.getRemoteHandler(remoteId)
    const xapi = this._xo.getXapi(vm)

    vm = xapi.getObject(vm._xapiId)

    // Get most recent base.
    const bases = orderBy(
      filter(vm.$snapshots, { name_label: `XO_DELTA_BASE_VM_SNAPSHOT_${tag}` }),
      base => base.snapshot_time
    )
    const baseVm = bases.pop()
    forEach(bases, base => { xapi.deleteVm(base.$id)::pCatch(noop) })

    // Check backup dirs.
    const dir = `vm_delta_${tag}_${vm.uuid}`
    const fullVdisRequired = []

    await Promise.all(
      mapToArray(vm.$VBDs, async vbd => {
        if (!vbd.VDI || vbd.type !== 'Disk') {
          return
        }

        const vdi = vbd.$VDI
        const backups = await this._listVdiBackups(handler, `${dir}/vdi_${vdi.uuid}`)

        // Force full if missing full.
        if (!find(backups, isFullVdiBackup)) {
          fullVdisRequired.push(vdi.$id)
        }
      })
    )

    // Export...
    const delta = await xapi.exportDeltaVm(vm.$id, baseVm && baseVm.$id, {
      snapshotNameLabel: `XO_DELTA_BASE_VM_SNAPSHOT_${tag}`,
      fullVdisRequired,
      disableBaseTags: true
    })

    $onFailure(async () => {
      await Promise.all(mapToArray(
        delta.streams,
        stream => stream.cancel()
      ))

      await xapi.deleteVm(delta.vm.uuid)
    })

    // Save vdis.
    const vdiBackups = await pSettle(
      mapToArray(delta.vdis, async (vdi, key) => {
        const vdiParent = xapi.getObject(vdi.snapshot_of)

        return this._saveDeltaVdiBackup(xapi, {
          vdiParent,
          isFull: !baseVm || find(fullVdisRequired, id => vdiParent.$id === id),
          handler,
          stream: delta.streams[`${key}.vhd`],
          dir,
          retention
        })
          .then(path => {
            delta.vdis[key] = {
              ...delta.vdis[key],
              xoPath: path
            }

            return path
          })
      })
    )

    const fulFilledVdiBackups = []
    let error

    // One or many vdi backups have failed.
    for (const vdiBackup of vdiBackups) {
      if (vdiBackup.isFulfilled()) {
        fulFilledVdiBackups.push(vdiBackup)
      } else {
        error = vdiBackup.reason()
        console.error('Rejected backup:', error)
      }
    }

    $onFailure(async () => {
      await Promise.all(
        mapToArray(fulFilledVdiBackups, vdiBackup => {
          return handler.unlink(`${dir}/${vdiBackup.value()}`, { checksum: true })::pCatch(noop)
        })
      )
    })

    if (error) {
      throw error
    }

    const date = safeDateFormat(new Date())
    const backupFormat = `${date}_${vm.name_label}`
    const infoPath = `${dir}/${backupFormat}${DELTA_BACKUP_EXT}`

    $onFailure(() => handler.unlink(infoPath)::pCatch(noop))

    // Write Metadata.
    await handler.outputFile(infoPath, JSON.stringify(delta, null, 2))

    // Here we have a completed backup. We can merge old vdis.
    await Promise.all(
      mapToArray(vdiBackups, vdiBackup => {
        const backupName = vdiBackup.value()
        const backupDirectory = backupName.slice(0, backupName.lastIndexOf('/'))
        const backupDir = `${dir}/${backupDirectory}`
        return this._mergeDeltaVdiBackups({ handler, dir: backupDir, retention })
          .then(() => { this._chainDeltaVdiBackups({ handler, dir: backupDir }) })
      })
    )

    // Delete old backups.
    await this._removeOldDeltaVmBackups(xapi, { vm, handler, dir, retention })

    if (baseVm) {
      xapi.deleteVm(baseVm.$id)::pCatch(noop)
    }

    // Returns relative path.
    return `${dir}/${backupFormat}`
  }

  // -----------------------------------------------------------------

  _mountVhd (remoteId, vhdPath) {
    return Promise.all([
      this._xo.getRemoteHandler(remoteId),
      tmpDir()
    ]).then(([ handler, mountDir ]) => {
      if (!handler._getRealPath) {
        throw new Error(`this remote is not supported`)
      }

      const remotePath = handler._getRealPath()
      vhdPath = resolveSubpath(remotePath, vhdPath)

      return Promise.resolve().then(() => {
        // TODO: remove when no longer necessary.
        //
        // Currently, the filenames of the VHD changes over time
        // (delta → full), but the JSON is not updated, therefore the
        // VHD path may need to be fixed.
        return endsWith(vhdPath, '_delta.vhd')
          ? pFromCallback(cb => stat(vhdPath, cb)).then(
            () => vhdPath,
            error => {
              if (error && error.code === 'ENOENT') {
                return `${vhdPath.slice(0, -10)}_full.vhd`
              }
            }
          )
          : vhdPath
      }).then(vhdPath => execa('vhdimount', [ vhdPath, mountDir ])).then(() =>
        pFromCallback(cb => readdir(mountDir, cb)).then(entries => {
          let max = 0
          forEach(entries, entry => {
            const matches = /^vhdi(\d+)/.exec(entry)
            if (matches) {
              const value = +matches[1]
              if (value > max) {
                max = value
              }
            }
          })

          if (!max) {
            throw new Error('no disks found')
          }

          return {
            path: `${mountDir}/vhdi${max}`,
            unmount: once(() => execa('fusermount', [ '-uz', mountDir ]))
          }
        })
      )
    })
  }

  _mountPartition (remoteId, vhdPath, partitionId) {
    return this._mountVhd(remoteId, vhdPath).then(device =>
      mountPartition2(device, partitionId).then(partition => ({
        ...partition,
        unmount: () => partition.unmount().then(device.unmount)
      })).catch(error => device.unmount().then(() => {
        throw error
      }))
    )
  }

  @deferrable
  async scanDiskBackup ($defer, remoteId, vhdPath) {
    const device = await this._mountVhd(remoteId, vhdPath)
    $defer(device.unmount)

    return {
      partitions: await listPartitions2(device)
    }
  }

  @deferrable
  async scanFilesInDiskBackup ($defer, remoteId, vhdPath, partitionId, path) {
    const partition = await this._mountPartition(remoteId, vhdPath, partitionId)
    $defer(partition.unmount)

    path = resolveSubpath(partition.path, path)

    const entries = await pFromCallback(cb => readdir(path, cb))

    const entriesMap = {}
    await Promise.all(mapToArray(entries, async name => {
      const stats = await pFromCallback(cb => stat(`${path}/${name}`, cb))::pCatch(noop)
      if (stats) {
        entriesMap[stats.isDirectory() ? `${name}/` : name] = {}
      }
    }))
    return entriesMap
  }

  async fetchFilesInDiskBackup (remoteId, vhdPath, partitionId, paths) {
    const partition = await this._mountPartition(remoteId, vhdPath, partitionId)

    let i = 0
    const onEnd = () => {
      if (!--i) {
        partition.unmount()
      }
    }
    return mapToArray(paths, path => {
      ++i
      return createReadStream(resolveSubpath(partition.path, path)).once('end', onEnd)
    })
  }
}
