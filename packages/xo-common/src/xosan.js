import {
  some
} from 'lodash'

export const srIsBackingHa = (sr) => {
  return sr.$pool.ha_enabled && some(sr.$pool.$ha_statefiles, f => f.$SR === sr)
}
