import JSON5 from 'json5'
import { CronJob } from 'cron'
import { utcParse } from 'd3-time-format'
import {
  forOwn,
  mean,
} from 'lodash'

const VM_FUNCTIONS = {
  cpu_usage: {
    description: 'Raises an alarm when the average usage of any CPU is higher than the threshold',
    unit: '%',
    comparator: '>',
    createParser: (legend, threshold) => {
      const regex = /cpu[0-9]+/
      const filteredLegends = legend.filter(l => l.name.match(regex))
      const accumulator = Object.assign(...filteredLegends.map(l => ({[l.name]: []})))
      const getDisplayableValue = () => {
        const means = Object.keys(accumulator).map(l => mean(accumulator[l]))
        return Math.max(...means) * 100
      }
      return {
        parseRow: (data) => {
          filteredLegends.forEach(l => {
            accumulator[l.name].push(data.values[l.index])
          })
        },
        getDisplayableValue,
        shouldAlarm: () => getDisplayableValue() > threshold,
      }
    },
  },
  memory_usage: {
    description: 'Raises an alarm when the used memory % is higher than the threshold',
    unit: '% used',
    comparator: '>',
    createParser: (legend, threshold) => {
      const memoryBytesLegend = legend.find(l => l.name === 'memory')
      const memoryKBytesFreeLegend = legend.find(l => l.name === 'memory_internal_free')
      const usedMemoryRatio = []
      const getDisplayableValue = () => mean(usedMemoryRatio) * 100
      return {
        parseRow: (data) => {
          const memory = data.values[memoryBytesLegend.index]
          usedMemoryRatio.push((memory - 1024 * data.values[memoryKBytesFreeLegend.index]) / memory)
        },
        getDisplayableValue,
        shouldAlarm: () => {
          return getDisplayableValue() > threshold
        },
      }
    },
  },
}

// list of currently ringing alarms, to avoid double notification
const currentAlarms = {}

export const configurationSchema = {
  type: 'object',
  properties: {
    serverUrl: {
      type: 'string',
      title: 'Xen Orchestra URL',
      description: 'URL used in alert messages to quickly get to the VMs (ex: http://192.168.100.244:9000/ )',
    },
    monitors: {
      type: 'array',
      title: 'VM Monitors',
      description: 'Alarms checking all VMs on all pools. The selected performance counter is sampled regularly and averaged. ' +
      'The Average is compared to the threshold and an alarm is raised upon crossing',
      items: {
        type: 'object',
        properties: {
          uuids: {
            title: 'Virtual Machines',
            type: 'array',
            items: {
              type: 'string',
              $type: 'VM',
            },
            default: ['0975c083-2bae-c03a-e5ff-5293780a70e7'],
          },
          variable_name: {
            title: 'Alarm Type',
            description: '<dl>' + Object.keys(VM_FUNCTIONS).map(k =>
              `<dt>${k} (${VM_FUNCTIONS[k].unit}): </dt><dd>${VM_FUNCTIONS[k].description}</dd>`).join(' ') + '</dl>',
            type: 'string',
            default: 'cpu_usage',
            enum: Object.keys(VM_FUNCTIONS),
          },
          alarm_trigger_level: {
            title: 'Threshold',
            description: 'The direction of the crossing is given by the Alarm type',
            type: 'number',
            default: 40,
          },
          alarm_trigger_period: {
            title: 'Average Length (s)',
            description: 'The points are averaged this number of seconds then the average is compared with the threshold',
            type: 'number',
            default: 60,
            enum: [60, 600],
          },
        },
        required: ['uuids'],
      },
    },
    toEmails: {
      type: 'array',
      title: 'Email addresses',
      description: 'Email addresses of the alert recipients',

      items: {
        type: 'string',
      },
      minItems: 1,
    },
    toXmpp: {
      type: 'array',
      title: 'xmpp address',
      description: 'an array of recipients (xmpp)',

      items: {
        type: 'string',
      },
      minItems: 1,
    },
  },
}

const clearCurrentAlarms = () => forOwn(currentAlarms, (v, k) => { delete currentAlarms[k] })

const raiseOrLowerAlarm = (alarmID, result, raiseCallback, lowerCallback) => {
  const current = currentAlarms[alarmID]
  if (result) {
    if (!current) {
      currentAlarms[alarmID] = true
      raiseCallback(alarmID)
    }
  } else {
    if (current) {
      try {
        lowerCallback(alarmID)
      } finally {
        delete currentAlarms[alarmID]
      }
    }
  }
}

async function getServerTimestamp (xapi, host) {
  const serverLocalTime = await xapi.call('host.get_servertime', host.$ref)
  return Math.floor((utcParse('%Y%m%dT%H:%M:%SZ')(serverLocalTime)).getTime() / 1000)
}

class PerfAlertXoPlugin {
  constructor (xo) {
    this._xo = xo
    this._job = new CronJob({cronTime: '* * * * *', start: false, onTick: this._checkMonitors.bind(this)})
  }

  async configure (configuration) {
    this._configuration = configuration
    clearCurrentAlarms()
  }

  generateVmUrl (vm) {
    return `${this._configuration.serverUrl}#/vms/${vm.uuid}/stats`
  }

  getEmailSignature () {
    return `\n\n\nSent from Xen Orchestra [perf-alert plugin](${this._configuration.serverUrl}#/settings/plugins)\n`
  }

  async test () {
    if (this._configuration.toEmails !== undefined && this._xo.sendEmail !== undefined) {
      const monitorPart = await Promise.all(this._configuration.monitors.map(async m => {
        const def = this.parseDefinition(m)
        const list = await Promise.all(def.vmsToCheck().map(async vm => {
          const rrd = await this.getRRDForVm(vm, def.observationPeriod)
          if (rrd === null) {
            return `[${vm.name_label}](${this.generateVmUrl(vm)}) |  | **Can't read performance counters, is the VM up?**`
          }
          const data = def.displayData(rrd, vm)
          const alarma = def.checkData(rrd, vm)
          return `[${vm.name_label}](${this.generateVmUrl(vm)}) | ${data} | ` + (alarma ? '**Alert Ongoing**' : 'no alert')
        }))
        return `
## Monitor for: ${m.variable_name} ${def.vmFunction.comparator} ${m.alarm_trigger_level}${def.vmFunction.unit}
List of the virtual machines that we could check:

VM  | Value | Alert
--- | -----:| ---:
${list.join('\n')}`
      }))
      const message = `
# Performance Alert Test
Your alarms and their current status:
${monitorPart.join('\n')}
${this.getEmailSignature()}`
      this._xo.sendEmail({
        to: this._configuration.toEmails,
        subject: `[Xen Orchestra] − Performance Alert TEST`,
        markdown: message,
      })
    }
  }

  load () {
    this._job.start()
  }

  unload () {
    this._job.stop()
  }

  parseDefinition (definition) {
    const alarmID = `VM|${definition.variable_name}|${definition.alarm_trigger_level}`
    const parseData = (result, vm) => {
      const parsedLegend = result.meta.legend.map((l, index) => {
        const [operation, type, uuid, name] = l.split(':')
        const parsedName = name.split('_')
        const lastComponent = parsedName[parsedName.length - 1]
        const relatedEntity = parsedName.length > 1 && lastComponent.match(/^[0-9a-f]{8}$/) ? lastComponent : null
        return {operation, type, uuid, name, relatedEntity, parsedName, index}
      })
      const legendTree = {}
      const getNode = (element, name, defaultValue = {}) => {
        const child = element[name]
        if (child === undefined) {
          element[name] = defaultValue
          return defaultValue
        }
        return child
      }
      parsedLegend.forEach(l => {
        const root = getNode(legendTree, l.uuid)
        const relatedNode = getNode(root, l.relatedEntity)
        relatedNode[l.name] = l
      })
      const vmFunction = VM_FUNCTIONS[definition.variable_name]
      const parser = vmFunction.createParser(parsedLegend.filter(l => l.uuid === vm.uuid), definition.alarm_trigger_level)
      result.data.forEach(d => parser.parseRow(d))
      return parser
    }
    return {
      ...definition,
      alarmID,
      vmFunction: VM_FUNCTIONS[definition.variable_name],
      vmsToCheck: () => definition.uuids.map(uuid => this._xo.getXapi(uuid).getObject(uuid)),
      observationPeriod: definition.alarm_trigger_period !== undefined ? definition.alarm_trigger_period : 60,
      displayData: (result, vm) => parseData(result, vm).getDisplayableValue().toFixed(1) + VM_FUNCTIONS[definition.variable_name].unit,
      checkData: (result, vm) => {
        const parser = parseData(result, vm)
        return parser.shouldAlarm()
      },
    }
  }

  async _checkMonitors () {
    const logger = await this._xo.getLogger('perf')
    const alarmDefinitions = this._configuration.monitors.map(def => ({...def, object_type: 'vm'}))

    const monitors = alarmDefinitions.map(this.parseDefinition.bind(this))

    for (const monitor of monitors) {
      const vms = monitor.vmsToCheck()
      for (const vm of vms) {
        const rrd = await this.getRRDForVm(vm, monitor.observationPeriod)
        const couldFindRRD = rrd !== null
        raiseOrLowerAlarm(`${monitor.alarmID}|${vm.uuid}|RRD`, !couldFindRRD, () => {
          this._xo.sendEmail({
            to: this._configuration.toEmails,
            subject: `[Xen Orchestra] − Performance Alert Secondary Issue`,
            markdown: `
## There was an issue when trying to check ${monitor.variable_name} ${monitor.vmFunction.comparator} ${monitor.alarm_trigger_level}${monitor.vmFunction.unit}
  * VM [${vm.name_label}](${this.generateVmUrl(vm)}) ${monitor.variable_name}: **Can't read performance counters, is the VM up?**

${this.getEmailSignature()} `,
          })
        }, () => {})
        if (!couldFindRRD) {
          continue
        }
        const predicate = monitor.checkData(rrd, vm)
        const raiseAlarm = (alarmID) => {
          logger.error(`Performance: VM [${vm.name_label}](${this.generateVmUrl(vm)}) ${monitor.variable_name}: **${monitor.displayData(rrd, vm)}**`)
          if (this._configuration.toEmails !== undefined && this._xo.sendEmail !== undefined) {
            this._xo.sendEmail({
              to: this._configuration.toEmails,
              subject: `[Xen Orchestra] − Performance Alert`,
              markdown: `
## ALERT ${monitor.variable_name} ${monitor.vmFunction.comparator} ${monitor.alarm_trigger_level}${monitor.vmFunction.unit}
  * VM [${vm.name_label}](${this.generateVmUrl(vm)}) ${monitor.variable_name}: **${monitor.displayData(rrd, vm)}**
### Description
  ${monitor.vmFunction.description}
${this.getEmailSignature()}`,
            })
          }
        }
        const lowerAlarm = (alarmID) => {
          console.log('lowering Alarm', alarmID)
          this._xo.sendEmail({
            to: this._configuration.toEmails,
            subject: `[Xen Orchestra] − Performance Alert END`,
            markdown: `
## END OF ALERT ${monitor.variable_name} ${monitor.vmFunction.comparator} ${monitor.alarm_trigger_level}${monitor.vmFunction.unit}
  * VM [${vm.name_label}](${this.generateVmUrl(vm)}) ${monitor.variable_name}: **${monitor.displayData(rrd, vm)}**
### Description
  ${monitor.vmFunction.description}
${this.getEmailSignature()}
              `,
          })
        }
        raiseOrLowerAlarm(`${monitor.alarmID}|${vm.uuid}`, predicate, raiseAlarm, lowerAlarm)
      }
    }
  }

  async getRRDForVm (vm, secondsAgo) {
    const host = vm.$resident_on
    if (host == null) {
      return null
    }
    // we get the xapi per host, because the alarms can check VMs in various pools
    const xapi = this._xo.getXapi(host.uuid)
    const serverTimestamp = await getServerTimestamp(xapi, host)
    return JSON5.parse(await (await xapi.getResource('/rrd_updates', {
      host: host,
      query: {
        cf: 'AVERAGE',
        host: 'true',
        json: 'true',
        vm_uuid: vm.uuid,
        start: serverTimestamp - secondsAgo,
      },
    })).readAll())
  }
}

exports.default = function ({xo}) {
  return new PerfAlertXoPlugin(xo)
}

/* example legend fields:
host : memory_total_kib
host : memory_free_kib
host : cpu_avg
host : cpu3
host : cpu2
host : cpu1
host : cpu0
host : loadavg
host : CPU3-avg-freq
host : CPU2-avg-freq
host : CPU1-avg-freq
host : CPU0-avg-freq
host : cpu3-P15
host : cpu3-P14
host : cpu3-P13
host : cpu3-P12
host : cpu3-P11
host : cpu3-P10
host : cpu3-P9
host : cpu3-P8
host : cpu3-P7
host : cpu3-P6
host : cpu3-P5
host : cpu3-P4
host : cpu3-P3
host : cpu3-P2
host : cpu3-P1
host : cpu3-P0
host : cpu2-P15
host : cpu2-P14
host : cpu2-P13
host : cpu2-P12
host : cpu2-P11
host : cpu2-P10
host : cpu2-P9
host : cpu2-P8
host : cpu2-P7
host : cpu2-P6
host : cpu2-P5
host : cpu2-P4
host : cpu2-P3
host : cpu2-P2
host : cpu2-P1
host : cpu2-P0
host : cpu1-P15
host : cpu1-P14
host : cpu1-P13
host : cpu1-P12
host : cpu1-P11
host : cpu1-P10
host : cpu1-P9
host : cpu1-P8
host : cpu1-P7
host : cpu1-P6
host : cpu1-P5
host : cpu1-P4
host : cpu1-P3
host : cpu1-P2
host : cpu1-P1
host : cpu1-P0
host : cpu0-P15
host : cpu0-P14
host : cpu0-P13
host : cpu0-P12
host : cpu0-P11
host : cpu0-P10
host : cpu0-P9
host : cpu0-P8
host : cpu0-P7
host : cpu0-P6
host : cpu0-P5
host : cpu0-P4
host : cpu0-P3
host : cpu0-P2
host : cpu0-P1
host : cpu0-P0
host : cpu3-C6
host : cpu3-C5
host : cpu3-C4
host : cpu3-C3
host : cpu3-C2
host : cpu3-C1
host : cpu3-C0
host : cpu2-C6
host : cpu2-C5
host : cpu2-C4
host : cpu2-C3
host : cpu2-C2
host : cpu2-C1
host : cpu2-C0
host : cpu1-C6
host : cpu1-C5
host : cpu1-C4
host : cpu1-C3
host : cpu1-C2
host : cpu1-C1
host : cpu1-C0
host : cpu0-C6
host : cpu0-C5
host : cpu0-C4
host : cpu0-C3
host : cpu0-C2
host : cpu0-C1
host : cpu0-C0
host : Tapdisks_in_low_memory_mode
host : memory_reclaimed_max
host : memory_reclaimed
host : pif_aggr_rx
host : pif_aggr_tx
host : pif_eth2_rx
host : pif_eth2_tx
host : pif_eth0_rx
host : pif_eth0_tx
host : pif_eth1_rx
host : pif_eth1_tx
host : xapi_open_fds
host : pool_task_count
host : pool_session_count
host : xapi_memory_usage_kib
host : xapi_free_memory_kib
host : xapi_live_memory_kib
host : xapi_allocation_kib
host : inflight_2b7b1501
host : iowait_2b7b1501
host : iops_total_2b7b1501
host : iops_write_2b7b1501
host : iops_read_2b7b1501
host : io_throughput_total_2b7b1501
host : io_throughput_write_2b7b1501
host : io_throughput_read_2b7b1501
host : write_latency_2b7b1501
host : read_latency_2b7b1501
host : write_2b7b1501
host : read_2b7b1501
host : inflight_72cc0148
host : iowait_72cc0148
host : iops_total_72cc0148
host : iops_write_72cc0148
host : iops_read_72cc0148
host : io_throughput_total_72cc0148
host : io_throughput_write_72cc0148
host : io_throughput_read_72cc0148
host : write_latency_72cc0148
host : read_latency_72cc0148
host : write_72cc0148
host : read_72cc0148
host : inflight_9218facb
host : iowait_9218facb
host : iops_total_9218facb
host : iops_write_9218facb
host : iops_read_9218facb
host : io_throughput_total_9218facb
host : io_throughput_write_9218facb
host : io_throughput_read_9218facb
host : write_latency_9218facb
host : read_latency_9218facb
host : write_9218facb
host : read_9218facb
host : inflight_44f9108d
host : iowait_44f9108d
host : iops_total_44f9108d
host : iops_write_44f9108d
host : iops_read_44f9108d
host : io_throughput_total_44f9108d
host : io_throughput_write_44f9108d
host : io_throughput_read_44f9108d
host : write_latency_44f9108d
host : read_latency_44f9108d
host : write_44f9108d
host : read_44f9108d
host : inflight_438aa8dd
host : iowait_438aa8dd
host : iops_total_438aa8dd
host : iops_write_438aa8dd
host : iops_read_438aa8dd
host : io_throughput_total_438aa8dd
host : io_throughput_write_438aa8dd
host : io_throughput_read_438aa8dd
host : write_latency_438aa8dd
host : read_latency_438aa8dd
host : write_438aa8dd
host : read_438aa8dd
host : inflight_69a97fd4
host : iowait_69a97fd4
host : iops_total_69a97fd4
host : iops_write_69a97fd4
host : iops_read_69a97fd4
host : io_throughput_total_69a97fd4
host : io_throughput_write_69a97fd4
host : io_throughput_read_69a97fd4
host : write_latency_69a97fd4
host : read_latency_69a97fd4
host : write_69a97fd4
host : read_69a97fd4
host : inflight_85536572
host : iowait_85536572
host : iops_total_85536572
host : iops_write_85536572
host : iops_read_85536572
host : io_throughput_total_85536572
host : io_throughput_write_85536572
host : io_throughput_read_85536572
host : write_latency_85536572
host : read_latency_85536572
host : write_85536572
host : read_85536572
host : inflight_d4a3c32d
host : iowait_d4a3c32d
host : iops_total_d4a3c32d
host : iops_write_d4a3c32d
host : iops_read_d4a3c32d
host : io_throughput_total_d4a3c32d
host : io_throughput_write_d4a3c32d
host : io_throughput_read_d4a3c32d
host : write_latency_d4a3c32d
host : read_latency_d4a3c32d
host : write_d4a3c32d
host : read_d4a3c32d
host : inflight_c5bb6dc6
host : iowait_c5bb6dc6
host : iops_total_c5bb6dc6
host : iops_write_c5bb6dc6
host : iops_read_c5bb6dc6
host : io_throughput_total_c5bb6dc6
host : io_throughput_write_c5bb6dc6
host : io_throughput_read_c5bb6dc6
host : write_latency_c5bb6dc6
host : read_latency_c5bb6dc6
host : write_c5bb6dc6
host : read_c5bb6dc6
vm : cpu1
vm : cpu0
vm : memory
vm : vbd_xvda_inflight
vm : vbd_xvda_iowait
vm : vbd_xvda_iops_total
vm : vbd_xvda_iops_write
vm : vbd_xvda_iops_read
vm : vbd_xvda_io_throughput_total
vm : vbd_xvda_io_throughput_write
vm : vbd_xvda_io_throughput_read
vm : vbd_xvda_write_latency
vm : vbd_xvda_read_latency
vm : vbd_xvda_write
vm : vbd_xvda_read
vm : vbd_xvdb_inflight
vm : vbd_xvdb_iowait
vm : vbd_xvdb_iops_total
vm : vbd_xvdb_iops_write
vm : vbd_xvdb_iops_read
vm : vbd_xvdb_io_throughput_total
vm : vbd_xvdb_io_throughput_write
vm : vbd_xvdb_io_throughput_read
vm : vbd_xvdb_write_latency
vm : vbd_xvdb_read_latency
vm : vbd_xvdb_write
vm : vbd_xvdb_read
vm : vif_0_tx
vm : vif_0_rx
vm : memory_target
vm : memory_internal_free
 */
