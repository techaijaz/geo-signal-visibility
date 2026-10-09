// ISO week label ("2026-W41"): weekly reports and citation runs happen once per week
export const isoWeek = (d = new Date()) => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = t.getUTCDay() || 7
    t.setUTCDate(t.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
