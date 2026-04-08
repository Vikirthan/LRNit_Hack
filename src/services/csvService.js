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
  const getFirst = (row, keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
        return row[key]
      }
    }
    return ''
  }

  return rows.map((row) => ({
    team_name: String(getFirst(row, ['team_name', 'TEAM_NAME', 'TeamName', 'team name', 'Team Name', 'name', 'Name'])).trim(),
    team_id: String(getFirst(row, ['team_id', 'TEAM_ID', 'TeamID', 'team id', 'Team ID', 'team number', 'Team Number', 'team_no', 'Team No', 'TeamNo'])).trim(),
    members_count: Number(getFirst(row, ['members_count', 'MEMBERS_COUNT', 'MembersCount', 'members count', 'Members Count', 'total_members', 'Total Members']) || 0),
    emails: String(getFirst(row, ['emails', 'EMAILS', 'Emails', 'email', 'Email']))
      .split(/[;,\s]+/)
      .map((email) => email.trim())
      .filter(Boolean),
    room_number: String(getFirst(row, ['room_number', 'ROOM_NUMBER', 'RoomNumber', 'room number', 'Room Number'])).trim(),
  }))
}
