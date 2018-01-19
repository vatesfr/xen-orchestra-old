import sortedIndex from 'lodash/sortedIndex'
import { DateTime } from 'luxon'

const NEXT_MAPPING = {
  month: { year: 1 },
  day: { month: 1 },
  weekday: { week: 1 },
  hour: { day: 1 },
  minute: { hour: 1 },
}

const setFirstAvailable = (date, unit, values) => {
  if (values === undefined) {
    return date
  }

  const curr = date.get(unit)
  const next = values[sortedIndex(values, curr) % values.length]
  if (curr === next) {
    return date
  }

  const newDate = date.set({ [unit]: next })
  return newDate > date ? newDate : newDate.plus(NEXT_MAPPING[unit])
}

// returns the next run, after the passed date
export default (schedule, date) => {
  // start with the next minute
  date = date
    .set({
      second: 0,
      millisecond: 0,
    })
    .plus({ minute: 1 })

  date = setFirstAvailable(date, 'minute', schedule.minute)

  date = setFirstAvailable(date, 'hour', schedule.hour)

  const applyMonth = date => setFirstAvailable(date, 'month', schedule.month)

  const { dayOfMonth, dayOfWeek } = schedule
  if (dayOfMonth !== undefined) {
    if (dayOfWeek !== undefined) {
      return DateTime.min(
        applyMonth(setFirstAvailable(date, 'day', dayOfMonth)),
        applyMonth(setFirstAvailable(date, 'weekday', dayOfWeek))
      )
    }

    date = setFirstAvailable(date, 'day', dayOfMonth)
  } else {
    date = setFirstAvailable(date, 'weekday', dayOfWeek)
  }

  return applyMonth(date)
}
