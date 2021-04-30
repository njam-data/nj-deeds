import { chromium } from 'playwright'
import { readJson, writeJson, fileExists } from './fs.js'

export async function createBrowserContext (options = {}) {
  const {
    useCookies = false,
    loginUrl,
    login,
    downloadsPath,
    headless = false
  } = options

  const browser = await chromium.launch({
    headless,
    acceptDownloads: true,
    downloadsPath
  })

  const page = await browser.newPage({
    acceptDownloads: true
  })

  let cookies

  if (!useCookies) {
    return { page, browser }
  }

  if (await fileExists(cookies)) {
    console.log('using saved cookies')

    cookies = await readJson(cookiesFilepath)
    await page.context().addCookies(cookies)
    await page.goto(loginUrl)
  } else {
    console.log('saving new cookies')

    if (login) {
      await page.goto(loginUrl)
      await login({ page, browser })
    }

    cookies = await page.context().cookies()
    await writeJson(cookiesFilepath, cookies)
  }

  return {
    browser,
    page
  }
}
