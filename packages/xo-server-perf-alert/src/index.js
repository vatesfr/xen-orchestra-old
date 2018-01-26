import JSON5 from 'json5'
import { CronJob } from 'cron'
import { utcParse } from 'd3-time-format'
import {
  forOwn,
  map,
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

const HOST_FUNCTIONS = {
  cpu_usage: {
    description: 'Raises an alarm when the average usage of any CPU is higher than the threshold',
    unit: '%',
    comparator: '>',
    createParser: (legend, threshold) => {
      const regex = /^cpu[0-9]+$/
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
      const memoryKBytesLegend = legend.find(l => l.name === 'memory_total_kib')
      const memoryKBytesFreeLegend = legend.find(l => l.name === 'memory_free_kib')
      const usedMemoryRatio = []
      const getDisplayableValue = () => mean(usedMemoryRatio) * 100
      return {
        parseRow: (data) => {
          const memory = data.values[memoryKBytesLegend.index]
          usedMemoryRatio.push((memory - data.values[memoryKBytesFreeLegend.index]) / memory)
        },
        getDisplayableValue,
        shouldAlarm: () => {
          return getDisplayableValue() > threshold
        },
      }
    },
  },
}

const TYPE_FUNCTION_MAP = {
  vm: VM_FUNCTIONS,
  host: HOST_FUNCTIONS,
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
    hostMonitors: {
      type: 'array',
      title: 'Host Monitors',
      description: 'Alarms checking hosts on all pools. The selected performance counter is sampled regularly and averaged. ' +
      'The Average is compared to the threshold and an alarm is raised upon crossing',
      items: {
        type: 'object',
        properties: {
          uuids: {
            title: 'Hosts',
            type: 'array',
            items: {
              type: 'string',
              $type: 'Host',
            },
            default: ['77b3f6ad-020b-4e48-b090-74b2a26c4f69'],
          },
          variable_name: {
            title: 'Alarm Type',
            description: '<dl>' + Object.keys(HOST_FUNCTIONS).map(k =>
              `<dt>${k} (${HOST_FUNCTIONS[k].unit}): </dt><dd>${HOST_FUNCTIONS[k].description}</dd>`).join(' ') + '</dl>',
            type: 'string',
            default: 'cpu_usage',
            enum: Object.keys(HOST_FUNCTIONS),
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
      },
    },
    vmMonitors: {
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

  _generateUrl (type, object) {
    const map = {
      vm: () => `${this._configuration.serverUrl}#/vms/${object.uuid}/stats`,
      host: () => `${this._configuration.serverUrl}#/hosts/${object.uuid}/stats`,
    }
    return map[type]()
  }

  _getEmailSignature () {
    return `\n\n\nSent from Xen Orchestra [perf-alert plugin](${this._configuration.serverUrl}#/settings/plugins)\n`
  }

  async test () {
    const hostMonitorPart2 = await Promise.all(map(this._getMonitors(), async m => {
      const hostList = (await m.snapshot()).map(entry => entry.tableItem)
      return `
## Monitor for ${m.title}

${m.tableHeader}
${hostList.join('\\n')}`
    }))

    this._sendAlertEmail('TEST', `
# Performance Alert Test
Your alarms and their current status:
${hostMonitorPart2.join('\n')}`)
  }

  load () {
    this._job.start()
  }

  unload () {
    this._job.stop()
  }

  _parseDefinition (definition) {
    const alarmID = `${definition.object_type}|${definition.variable_name}|${definition.alarm_trigger_level}`
    const typeFunction = TYPE_FUNCTION_MAP[definition.object_type][definition.variable_name]
    const parseData = (result, uuid) => {
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
      const parser = typeFunction.createParser(parsedLegend.filter(l => l.uuid === uuid), definition.alarm_trigger_level)
      result.data.forEach(d => parser.parseRow(d))
      return parser
    }
    const objectsToCheck = () => definition.uuids.map(uuid => this._xo.getXapi(uuid).getObject(uuid))
    const observationPeriod = definition.alarm_trigger_period !== undefined ? definition.alarm_trigger_period : 60
    const typeText = definition.object_type === 'host' ? 'Host' : 'VM'
    return {
      ...definition,
      alarmID,
      vmFunction: typeFunction,
      title: `${typeText} ${definition.variable_name} ${typeFunction.comparator} ${definition.alarm_trigger_level}${typeFunction.unit}`,
      tableHeader: `${typeText}  | Value | Alert\n--- | -----:| ---:`,
      snapshot: async () => {
        return Promise.all(map(objectsToCheck(), async monitoredObject => {
          const objectLink = `[${monitoredObject.name_label}](${this._generateUrl(definition.object_type, monitoredObject)})`
          const rrd = await this.getRRD(monitoredObject, observationPeriod, definition.object_type === 'host')
          const couldFindRRD = rrd !== null
          const result = {
            object: monitoredObject,
            couldFindRRD,
            objectLink: objectLink,
            listItem: `  * ${typeText} ${objectLink} ${definition.variable_name}: **Can't read performance counters**`,
            tableItem: `${objectLink} | - | **Can't read performance counters**`,
          }
          if (!couldFindRRD) {
            return result
          }
          const data = parseData(rrd, monitoredObject.uuid)
          const textValue = data.getDisplayableValue().toFixed(1) + typeFunction.unit
          const shouldAlarm = data.shouldAlarm()
          return {
            ...result,
            value: data.getDisplayableValue(),
            shouldAlarm: shouldAlarm,
            textValue: textValue,
            listItem: `  * ${typeText} ${objectLink} ${definition.variable_name}: ${textValue}`,
            tableItem: `${objectLink} | ${textValue} | ${shouldAlarm ? '**Alert Ongoing**' : 'no alert'}`,
          }
        }))
      },
    }
  }

  _getMonitors () {
    return map(this._configuration.hostMonitors, def => this._parseDefinition({...def, object_type: 'host'})).concat(
      map(this._configuration.vmMonitors, def => this._parseDefinition({...def, object_type: 'vm'})))
  }

  async _checkMonitors () {
    const monitors = this._getMonitors()
    for (const monitor of monitors) {
      const snapshot = await monitor.snapshot()
      for (const entry of snapshot) {
        raiseOrLowerAlarm(`${monitor.alarmID}|${entry.object.uuid}|RRD`, !entry.couldFindRRD, () => {
          this._sendAlertEmail('Secondary Issue', `
## There was an issue when trying to check ${monitor.title}
${entry.listItem}`)
        }, () => {})
        if (!entry.couldFindRRD) {
          continue
        }
        const raiseAlarm = (alarmID) => {
          // sample XenCenter message:
          // value: 1.242087 config: <variable> <name value="mem_usage"/> </variable>
          this._xo.getXapi(entry.object.uuid).call('message.create', 'ALARM', 3, entry.object.$type, entry.object.uuid,
            `value: ${entry.value.toFixed(1)} config: <variable> <name value="${monitor.variable_name}"/> </variable>`)
          this._sendAlertEmail('', `
## ALERT ${monitor.title}
${entry.listItem}
### Description
  ${monitor.vmFunction.description}`)
        }
        const lowerAlarm = (alarmID) => {
          console.log('lowering Alarm', alarmID)
          this._sendAlertEmail('END OF ALERT', `
## END OF ALERT ${monitor.title}
${entry.listItem}
### Description
  ${monitor.vmFunction.description}`)
        }
        raiseOrLowerAlarm(`${monitor.alarmID}|${entry.object.uuid}`, entry.shouldAlarm, raiseAlarm, lowerAlarm)
      }
    }
  }

  _sendAlertEmail (subjectSuffix, markdownBody) {
    if (this._configuration.toEmails !== undefined && this._xo.sendEmail !== undefined) {
      this._xo.sendEmail({
        to: this._configuration.toEmails,
        subject: `[Xen Orchestra] − Performance Alert ${subjectSuffix}`,
        markdown: markdownBody + this._getEmailSignature(),
      })
    } else {
      throw new Error('The email alert system has a configuration issue.')
    }
  }

  // forHost === false means "for VM"
  async getRRD (xoObject, secondsAgo, forHost) {
    const host = forHost ? xoObject : xoObject.$resident_on
    if (host == null) {
      return null
    }
    // we get the xapi per host, because the alarms can check VMs in various pools
    const xapi = this._xo.getXapi(host.uuid)
    const serverTimestamp = await getServerTimestamp(xapi, host)
    const payload = {
      host: host,
      query: {
        cf: 'AVERAGE',
        host: forHost,
        json: 'true',
        start: serverTimestamp - secondsAgo,
      },
    }
    if (!forHost) {
      payload['vm_uuid'] = xoObject.uuid
    }
    return JSON5.parse(await (await xapi.getResource('/rrd_updates', payload)).readAll())
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
