import * as XLSX from 'xlsx'
import Papa from 'papaparse'

export async function parseTeamFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'csv') {
    const csvText = await file.text()
    const { data } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    })
    return normalizeRows(data)
  }

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer)
  const firstSheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
  return normalizeRows(rows)
}

function normalizeRows(rows) {
  if (rows.length > 0) {
    console.log('Import Debug - First Row Keys:', Object.keys(rows[0]))
  }

  const getFirst = (row, searchKeys) => {
    // We'll try to find a key that matches (case-insensitive, space-insensitive)
    const rowKeys = Object.keys(row)
    for (const searchKey of searchKeys) {
      const normalizedSearch = searchKey.toLowerCase().replace(/[\s_]/g, '')
      
      for (const rowKey of rowKeys) {
        const normalizedRowKey = rowKey.toLowerCase().replace(/[\s_]/g, '')
        if (normalizedRowKey === normalizedSearch) {
          const val = row[rowKey]
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return val
          }
        }
      }
    }
    return ''
  }

  return rows.map((row) => {
    const team_id = String(getFirst(row, ['teamid', 'teamnumber', 'teamno', 'id'])).trim()
    const emailsRaw = String(getFirst(row, ['emails', 'email', 'memberemails', 'participantemails', 'studentemails', 'contact'])).trim()
    const emails = emailsRaw.split(/[;,\n\r]+/).map(e => e.trim()).filter(Boolean)

    if (emails.length > 0) {
      console.log(`Import Debug - Team ${team_id}: Found ${emails.length} emails.`)
    } else {
      console.log(`Import Debug - Team ${team_id}: NO EMAILS FOUND. Raw Value:`, emailsRaw)
    }

    return {
      team_name: String(getFirst(row, ['teamname', 'name'])).trim(),
      team_id,
      members_count: Number(getFirst(row, ['memberscount', 'totalmembers', 'count']) || 0),
      emails,
      room_number: String(getFirst(row, ['roomnumber', 'room'])).trim(),
    }
  })
}
