import { saveAs } from 'file-saver'

export function exportScoreboardCsv(teams) {
  const header = 'Team Name,Team Number,Negative Points\n'
  const rows = teams
    .map((team) => {
      const safeName = String(team.team_name || '').replaceAll(',', ' ')
      const safeNumber = String(team.team_id || '').replaceAll(',', ' ')
      return `${safeName},${safeNumber},${team.penalty_points || 0}`
    })
    .join('\n')

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' })
  saveAs(blob, `ticketscan-scoreboard-${Date.now()}.csv`)
}
