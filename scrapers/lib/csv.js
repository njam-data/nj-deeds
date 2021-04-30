export function formatCsvData (sourceRows, options = {}) {
  const { errors = false } = options

  let headers = [
    { id: 'address', title: 'address' },
    { id: 'price', title: 'price' },
    { id: 'date', title: 'date' },
    { id: 'grantor', title: 'grantor' },
    { id: 'grantee', title: 'grantee' },
    { id: 'block', title: 'block' },
    { id: 'lot', title: 'lot' },
    { id: 'qualifier', title: 'qualifier' },
    { id: 'municipality', title: 'municipality' },
    { id: 'county', title: 'county' },
    { id: 'book', title: 'book' },
    { id: 'page', title: 'page' },
    { id: 'book_type', title: 'book_type' },
    { id: 'file_number', title: 'file_number' },
    { id: 'type', title: 'type' },
    { id: 'legal', title: 'legal' },
  ]

  if (errors) {
    headers = [
      { id: 'error_message', title: 'error_message' },
      { id: 'error', title: 'error' },
      ...headers
    ]
  } else {
    headers = [
      { id: 'message', title: 'message' },
      ...headers
    ]
  }

  const rows = sourceRows.map((sourceRow) => {
    const { message, data } = sourceRow

    let obj = {}

    if (errors) {
      obj = {
        error_message: sourceRow.error_message,
        error: sourceRow.error,
        ...data
      }
    } else {
      obj = {
        message,
        ...data
      }
    }

    return obj
  })

  return { headers, rows }
}
