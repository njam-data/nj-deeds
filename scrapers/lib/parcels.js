import got from 'got'

export class Parcels {
  constructor (options = {}) {
    this.token = options.token
    this.url = options.url
  }

  async request (options) {
    console.log('request options', options)
    const result = await got.post(this.url, {
      json: options,
      responseType: 'json',
      headers: {
        'Authorization': `basic ${this.token}`
      }
    })

    console.log('result', result.body)
    return result.body
  }
}
