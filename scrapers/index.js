import * as path from 'path'

import { join } from 'desm'
import DotEnv from 'dotenv'
import { format, subDays } from 'date-fns'
import execa from 'execa'
import glob from 'fast-glob'
import got from 'got'

import { createDateRange } from './lib/date.js'

import atlantic from './atlantic.js'
import camden from './camden.js'
import capeMay from './cape-may.js'
import ocean from './ocean.js'
import salem from './salem.js'

DotEnv.config()

const args = process.argv.slice(2)

const PARCEL_API = process.env.PARCEL_API
const PARCEL_API_TOKEN = process.env.PARCEL_API_TOKEN

const currentDate = Date.now()
const startDate = subDays(currentDate, 8)
const dates = createDateRange(startDate, 7)

console.log('currentDate, startDate, dates', currentDate, startDate, dates)

const counties = {
  atlantic: {
    scraper: atlantic,
    options: {
      county: 'atlantic',
      portalUrl: 'http://24.246.110.8/or_web1/'
    }
  },
  camden: {
    scraper: camden,
    options: {
      county: 'camden',
      portalUrl: 'http://24.246.110.18/SearchAnywhere/'
    }
  },
  capeMay: {
    scraper: capeMay,
    options: {
      county: 'cape-may',
      portalUrl: 'http://clerk.capemaycountynj.gov/publicsearch/'
    }
  },
  ocean: {
    scraper: ocean,
    options: {
      county: 'ocean',
      portalUrl: 'http://sng.co.ocean.nj.us/publicsearch/'
    }
  },
  salem: {
    scraper: salem,
    options: {
      county: 'salem',
      portalUrl: 'http://216.64.40.6/publicsearch/'
    }
  }
}

if (args[0] && counties[args[0]]) {
  for (const date of dates) {
    const county = counties[args[0]]

    const options = {
      ...county.options,
      PARCEL_API,
      PARCEL_API_TOKEN,
      date
    }

    await county.scraper(options)
    await compileFiles({ dates, county: options.county })
  }
} else {
  for (const date of dates) {
    for (const county of counties) {
      const options = {
        ...county.options,
        PARCEL_API,
        PARCEL_API_TOKEN,
        date
      }
  
      await county.scraper(options)
      await compileFiles({ dates, county: options.county })
    }
  }
}

async function compileFiles (options) {
  const { dates, county } = options

  const startDate = format(dates[0], 'yyyy-MM-dd')
  const endDate = format(dates[dates.length-1], 'yyyy-MM-dd')
  const countyDirectory = join(import.meta.url, '..', 'data', county)
  const deedFiles = await glob('*-deeds.csv', { cwd: countyDirectory, absolute: true })
  const deedOutputFilepath = path.join(countyDirectory, `${options.county}-${startDate}-${endDate}-deeds-all.csv`)
  const errorOutputFilepath = path.join(countyDirectory, `${options.county}-${startDate}-${endDate}-deeds-errors-all.csv`)
  const errorFiles = await glob('*-errors.csv', { cwd: countyDirectory, absolute: true })
  await execa('xsv', ['cat', 'rows', ...deedFiles, '-o', deedOutputFilepath])
  await execa('xsv', ['cat', 'rows', ...errorFiles, '-o', errorOutputFilepath])
}
