import { addDays } from 'date-fns'

export function createDateRange (startDate, days) {
  console.log('createDateRange', startDate, days)
    const dates = []
    let currentDate = startDate
    const endDate = addDays(startDate, days)

    while (currentDate <= endDate) {
      dates.push(new Date (currentDate))
      currentDate = addDays(currentDate, 1)
    }

    return dates
}
