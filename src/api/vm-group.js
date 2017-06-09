export async function start ({ vmGroup }) {
  await this.getXapi(vmGroup).call('VM_appliance.start', vmGroup._xapiRef, false)
}

start.params = {
  id: { type: 'string' }
}

start.resolve = {
  vmGroup: ['id', 'VmGroup', 'operate']
}

export async function shutdown ({ vmGroup }) {
  await this.getXapi(vmGroup).call('VM_appliance.shutdown', vmGroup._xapiRef)
}

shutdown.params = {
  id: { type: 'string' }
}

shutdown.resolve = {
  vmGroup: ['id', 'VmGroup', 'operate']
}

export async function set ({ vmGroup, name_label: nameLabel, name_description: nameDescription }) {
  if (nameDescription) await this.getXapi(vmGroup).call('VM_appliance.set_name_description', vmGroup._xapiRef, nameDescription)
  if (nameLabel) await this.getXapi(vmGroup).call('VM_appliance.set_name_label', vmGroup._xapiRef, nameLabel)
}

set.params = {
  id: { type: 'string' },
  description: { type: 'string', optional: true },
  label: { type: 'string', optional: true }
}

set.resolve = {
  vmGroup: ['id', 'VmGroup', 'operate']
}

export async function destroy ({vmGroup}) {
  await this.getXapi(vmGroup).call('VM_appliance.destroy', vmGroup._xapiRef)
}

destroy.params = {
  id: { type: 'string' }
}

destroy.resolve = {
  vmGroup: ['id', 'VmGroup', 'operate']
}

export async function create ({pool, name_label, name_description}) {
  await this.getXapi(pool).call('VM_appliance.create', {name_label, name_description})
}

create.params = {
  id: { type: 'string' },
  name_label: { type: 'string' },
  name_description: { type: 'string' }
}

create.resolve = {
  pool: ['id', 'pool', 'operate']
}
