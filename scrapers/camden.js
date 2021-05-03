import * as path from 'path'
import * as fs from 'fs/promises'

import { join } from 'desm'
import { format } from 'date-fns'
import retry from 'async-retry'

import { writeJson, writeCsv } from './lib/fs.js'
import { formatCsvData } from './lib/csv.js'
import { createBrowserContext } from './lib/create-browser-context.js'
import { repeat } from './lib/repeat.js'
import { Parcels } from './lib/parcels.js'

export default async function scraper (options = {}) {
  const {
    portalUrl,
    county,
    date,
    PARCEL_API,
    PARCEL_API_TOKEN
  } = options

  console.log(`${county} options`, options)

  const scrapeDate = format(date, 'yyyy-MM-dd')
  const formInputDate = format(date, 'M/dd/yyyy')

  const dataDirectory = join(import.meta.url, '..', 'data')
  const countyDirectory = path.join(dataDirectory, county)
  const countyDataJsonFilepath = path.join(countyDirectory, `${county}-${scrapeDate}-deeds.json`)
  const countyDataCsvFilepath = path.join(countyDirectory, `${county}-${scrapeDate}-deeds.csv`)
  const countyErrorJsonFilepath = path.join(countyDirectory, `${county}-${scrapeDate}-deeds-errors.json`)
  const countyErrorCsvFilepath = path.join(countyDirectory, `${county}-${scrapeDate}-deeds-errors.csv`)
  const scrapeInfoFilepath = path.join(countyDirectory, `scrape-info-${scrapeDate}.json`)
  const tmpDirectory = join(import.meta.url, '..', 'tmp')
  const downloadsDirectory = path.join(tmpDirectory, 'downloads')

  await fs.mkdir(countyDirectory, { recursive: true })

  const { page, browser } = await createBrowserContext({
    useCookies: false,
    downloadsPath: downloadsDirectory,
    headless: true
  })

  const parcels = new Parcels({
    url: PARCEL_API,
    token: PARCEL_API_TOKEN
  })

  const allRows = []
  const errors = []

  await page.goto(portalUrl)
  await page.click('text="Document Type"')

  const form = await page.$('[name="docSearchForm"]')

  await page.waitForTimeout(500)

  const documentTypeInput = await form.$('[placeholder="Document Types"]')
  documentTypeInput.fill('DEED')

  const startDateInput = await page.$('body > div:nth-child(1) > div.ng-isolate-scope > div > div.tab-pane.ng-scope.active > div > div.ng-isolate-scope > div > div.tab-pane.ng-scope.active > form > div:nth-child(4) > div:nth-child(2) > p > input')
  startDateInput.fill(formInputDate)

  const endDateInput = await page.$('body > div:nth-child(1) > div.ng-isolate-scope > div > div.tab-pane.ng-scope.active > div > div.ng-isolate-scope > div > div.tab-pane.ng-scope.active > form > div:nth-child(4) > div:nth-child(3) > p > input')
  endDateInput.fill(formInputDate)

  const rowsPerPageInput = await page.$('body > div:nth-child(1) > div.ng-isolate-scope > div > div.tab-pane.ng-scope.active > div > div:nth-child(3) > div:nth-child(2) > span > select')
  await rowsPerPageInput.selectOption('25')

  const searchButton = await form.$('text="Search"')
  await searchButton.click()

  await page.waitForTimeout(1000)

  const headerElements = await page.$$('.ag-header-cell-text')
  const headers = await Promise.all(headerElements.map(async (header) => {
    return header.textContent()
  }))

  await page.waitForTimeout(300)
  const noRecords = await page.$('#results.ng-hide')

  if (noRecords) {
    const scrapeInfo = {
      totalScraped: 0,
      totalErrors: 0,
      message: 'No records found'
    }

    await writeJson(scrapeInfoFilepath, scrapeInfo)
    await browser.close()
    return
  }

  const paginationButtons = await page.$$('.col-sm-12 div button.btn-link.ng-binding')

  for (const [i, button] of paginationButtons.entries()) {
    if (i !== 0) {
      await retry(async () => {
        await button.click()
      })
    }

    await retry(async () => {
      await page.click('.ag-row')
    })

    await repeat(25, async () => {
      await page.keyboard.press('ArrowDown')
    })

    const rowElements = await page.$$('.ag-row')
    for (const rowElement of rowElements) {
      const rowCells = await rowElement.$$('.ag-cell')

      const rowValues = await Promise.all(rowCells.map(async (cell) => {
        return cell.textContent()
      }))

      const row = rowValues.reduce((obj, val, i) => {
        if (headers[i]) {
          const header = headers[i]
          obj[header] = val
        }
        return obj
      }, {})

      await retry(async () => {
        await page.waitForTimeout(500)
        const viewbutton = await rowElement.$('button')
        await viewbutton.click()
      })

      await page.waitForTimeout(500)
      const documentTableRows = await page.$$('#documentDetail table tr')

      const document = {}
      for (const row of documentTableRows) {
        const [keyElement, valueElement] = await row.$$('td')

        let keyText
        if (keyElement.length > 1) {
          keyText = keyElement.map(async (el) => {
            return el.textContent()
          }).join(', ')
        } else {
          keyText = await keyElement.textContent()
        }

        let valueText
        const multipleValues = await valueElement.$$('div')
        if (multipleValues.length && multipleValues.length > 1) {
          valueText = (await Promise.all(multipleValues.map(async (el) => {
            return el.textContent()
          }))).join(', ').replace(/, ([^,]*)$/, ' and $1')
        } else {
          valueText = await valueElement.textContent()
        }

        const key = keyText.trim().toLowerCase().replace(':', '')
        const value = valueText.trim()
        document[key] = value
      }

      let lot = null
      let qualifier = null
      let match

      if (row.Lot) {
        match = row.Lot.match(/^([0-9.]*)([a-zA-Z])?(.*)/)

        if (match.length === 1) {
          lot = match[0]
        } else {
          lot = match[1]
          if (match[2]) {
            qualifier = match[2] + match[3]
          }
        }
      }

      const data = {
        address: null,
        price: document.consideration,
        date: row.Date,
        grantor: document.grantor,
        grantee: document.grantee,
        block: row.Block,
        lot,
        qualifier,
        municipality: row.Town.replace('BOROUGH', 'BORO'),
        county,
        book: row.Book,
        page: row.Page,
        book_type: document['book type'],
        file_number: row['File#'],
        type: row.Type,
        legal: document.legal
      }

      let response
      try {
        response = await parcels.request({
          block: data.block,
          lot: data.lot,
          qualifier: data.qualifier,
          county: data.county.toUpperCase(),
          municipality: data.municipality
        })
      } catch (error) {
        console.log('error fetching parcel', error)
        errors.push({
          error_message: 'error fetching parcel',
          error,
          data,
          document,
          row,
          match
        })
      }

      if (response && !response.length) {
        errors.push({
          error_message: 'no parcels found',
          data,
          document,
          row,
          response,
          match
        })
      } else if (response && response.length > 1) {
        errors.push({
          error_message: 'multiple parcels found',
          data,
          row,
          document,
          response,
          match
        })
      } else if (response) {
        const [parcelData] = response

        data.address = parcelData.prop_loc
        const message = `${data.address} in ${data.municipality}, ${data.county} was sold for ${data.price} on ${data.date}, by ${data.grantor}, to ${data.grantee}.`

        const [book, bookPage] = document['book/page'].split('/')

        if (row.Book !== book || row.Page !== bookPage) {
          errors.push({
            error_message: 'book and page do not match',
            data,
            row,
            document,
            parcel: parcelData
          })
        }

        allRows.push({
          data,
          message,
          row,
          document,
          parcel: parcelData
        })
      }

      await page.waitForTimeout(500)
      await retry(async () => {
        await page.click('text="Results"')
      })
    }
  }

  await writeJson(countyDataJsonFilepath, allRows)
  const csvData = await formatCsvData(allRows)
  await writeCsv(countyDataCsvFilepath, csvData)

  await writeJson(countyErrorJsonFilepath, errors)
  const csvErrors = await formatCsvData(errors, { errors: true })
  await writeCsv(countyErrorCsvFilepath, csvErrors)

  const scrapeInfo = {
    totalScraped: allRows.length,
    totalErrors: errors.length
  }

  await writeJson(scrapeInfoFilepath, scrapeInfo)
  await browser.close()
}
