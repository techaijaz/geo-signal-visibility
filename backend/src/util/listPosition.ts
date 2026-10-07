// Where a brand sits in an AI answer, shared by the scan (your brand) and the lost-to list (other brands)

// "1.", "2)", and the same behind markdown: "**1. Ajmal**", "### 2.", "- **3.**", "4\."
const LIST_NUMBER = /^[\s>#*_\-+•]*(\d{1,2})\\?[.)](?!\d)/

export const listNumber = (line: string): number | null => {
    const m = line.match(LIST_NUMBER)
    return m ? parseInt(m[1], 10) : null
}

// A top-level bullet ("- Ajmal", "* Ajmal", "• Ajmal"); indented bullets belong to the item above
const TOP_BULLET = /^[-*•+]\s+\S/
// Markdown table rows, and the "|---|:--:|" rule under the header
const TABLE_ROW = /^\s*\|/
const TABLE_RULE = /^\s*\|?[\s:|-]+$/

// Place of a table row: its number cell ("| 2 | Rasasi |"), else its row among the data rows
const tablePosition = (lines: string[], i: number): number => {
    const first =
        lines[i]
            .split('|')
            .map((c) => c.replace(/[*_]/g, '').trim())
            .filter(Boolean)[0] || ''
    if (/^\d{1,2}\.?$/.test(first)) return parseInt(first, 10)
    let start = i
    while (start > 0 && TABLE_ROW.test(lines[start - 1])) start--
    const rule = lines.slice(start, i + 1).findIndex((l) => TABLE_RULE.test(l) && l.includes('-'))
    const firstData = rule === -1 ? start : start + rule + 1
    return Math.max(i - firstData + 1, 1)
}

// Position of line i: its list number; else, in a table, its row; else its place in a top-level bullet
// list, unless a numbered item right above owns those bullets; else the number of the list item it sits
// under; else the line (max 5)
export const linePosition = (lines: string[], i: number): number => {
    if (listNumber(lines[i]) === null && TABLE_ROW.test(lines[i])) return tablePosition(lines, i)
    if (TOP_BULLET.test(lines[i]) && listNumber(lines[i]) === null) {
        let n = 1
        let j = i - 1
        for (; j >= 0 && (TOP_BULLET.test(lines[j]) || /^\s+\S/.test(lines[j]) || !lines[j].trim()); j--) if (TOP_BULLET.test(lines[j])) n++
        // "6. Budget options" followed by "- SK Perfumes": the bullets belong to item 6
        const owner = j >= 0 ? listNumber(lines[j]) : null
        return owner ?? n
    }
    for (let j = i; j >= 0; j--) {
        const n = listNumber(lines[j])
        if (n !== null) return n
    }
    return Math.min(i + 1, 5)
}
