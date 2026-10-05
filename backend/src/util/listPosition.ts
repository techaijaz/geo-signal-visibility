// Where a brand sits in an AI answer, shared by the scan (your brand) and the lost-to list (other brands)

// "1.", "2)", and the same behind markdown: "**1. Ajmal**", "### 2.", "- **3.**", "4\."
const LIST_NUMBER = /^[\s>#*_\-+•]*(\d{1,2})\\?[.)](?!\d)/

export const listNumber = (line: string): number | null => {
    const m = line.match(LIST_NUMBER)
    return m ? parseInt(m[1], 10) : null
}

// Position of line i: its list number, else the number of the list item it sits under, else the line (max 5)
export const linePosition = (lines: string[], i: number): number => {
    for (let j = i; j >= 0; j--) {
        const n = listNumber(lines[j])
        if (n !== null) return n
    }
    return Math.min(i + 1, 5)
}
