const OpenAIApi = require("openai");

const openai = new OpenAIApi({ apiKey: process.env.OPENAI_API_KEY });

const MAX_OCR_CHARS = 40000;

function truncateAtBoundary(text, limit) {
    if (!text || text.length <= limit) return text;
    const slice = text.slice(0, limit);
    const lastComma = slice.lastIndexOf(",");
    const lastNewline = slice.lastIndexOf("\n");
    const cut = Math.max(lastComma, lastNewline);
    return cut > limit * 0.8 ? slice.slice(0, cut) : slice;
}

const processOpenAIRefill = async (ocrText, ownDocNumber) => {
    const truncated = truncateAtBoundary(ocrText, MAX_OCR_CHARS);
    const ownNumberHint = ownDocNumber
        ? `\nThe letter being analyzed has its own letter number "${ownDocNumber}" — DO NOT include this value in the references output.`
        : "";

    const prompt = `
You are extracting reference letter numbers cited inside a formal business letter that has been OCR'd.

Return ONLY a JSON object with a single key:
{ "references": "comma,separated,letter,codes" }

If no valid references are found, return { "references": "" }.

## What counts as a reference

A "reference" is the identifier of ANOTHER letter that the current letter cites. References may appear in TWO ways:

1) Under a formal header — keywords (case-insensitive): "Ref:", "Reference:", "References:", "Ref.-", "Ref.:".
   Items beneath these may be numbered or bulleted. Extract each letter code listed.

2) Inline in the body — phrases that cite a prior letter:
   - "our letter no. X"
   - "your letter no. X"
   - "vide letter no. X"
   - "vide our letter no. X"
   - "vide your letter no. X"
   - "letter No.: X"
   - "Letter No X"
   - "office letter no. X"
   - "this office letter No. X"
   - "Our LOA Acceptance Letter No X"
   - "Earlier Letter No X"
   - Similar variations (case-insensitive, punctuation tolerant)

Capture the code X that follows the citation phrase. Stop capturing at the next date, comma, dash, "dated", "Dt", "Dtd", "Dl", or end of clause.

## Valid code patterns

A letter code must contain at least ONE of: a slash (/), a dash (-), or be a numeric ID with 3+ digits.

Examples of VALID codes:
  SPSCPL/BSRDCL/GANGAPATH/AE/22-23/253
  AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0118
  NH-12014/17/2023-RO Patna
  NH-12014/17/2023-RO Patna (218701)-162
  SPS/P-353/38
  SPS/SITE/DS6L/75
  3728
  2344
  168

## Filtering rules — apply ALL of these

- DROP any code that exactly matches the letter's own number (case-insensitive, whitespace-stripped).${ownNumberHint}
- DROP labels and prefixes: "Letter No", "No.:", "No.", "Letter no", "Office Letter No", "Ref:", "Our Letter No", "Your Letter No". Keep only the code itself.
- DROP dates and "dated X" / "Dt X" / "Dtd X" suffixes.
- DROP generic non-letter references: "EPC Contract Agreement", "Your Quotation", "Contract Agreement", "Tender Document", "LOA" alone without a code, "Agreement dated …". Anything that is a phrase but not a code.
- Trim spaces INSIDE multi-token codes (e.g. "B / W .148 / 1 / 99723 / EPC / WA" → "B/W.148/1/99723/EPC/WA").
- Deduplicate.

## Output format

- Comma-separated. No spaces between items.
- No spaces inside individual codes.
- If nothing valid is found, return exactly { "references": "" }.
- Return ONLY the JSON object. No prose, no markdown, no code fences.

## Examples

### Example 1 — formal Ref: section
Input fragment:
  Ref: 1. SPSCPL/BSRDCL/GANGAPATH/AE/22-23/253 dated 18.07.2023
       2. AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0118 dated 27.06.2023
       3. EPC Contract Agreement dated 26.02.2024
Output:
  { "references": "SPSCPL/BSRDCL/GANGAPATH/AE/22-23/253,AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0118" }

### Example 2 — inline body citations
Input fragment:
  "...the COS Order was issued vide your letter no. 3728 dated 06.01.2026, and the COS Notice
   was earlier intimated vide your letter no. 3328 dated 11.07.2025. Refer also to our letters
   no. 2344 dated 19.03.2026, 2324 dated 08.03.2026, and 2378 dated 06.04.2026."
Output:
  { "references": "3728,3328,2344,2324,2378" }

### Example 3 — mixed header + inline
Input fragment:
  Ref: Our office letter no. SPS/P-353/38 Dtd: 04.05.2024
  Body: "...as discussed vide your letter NH-12014/17/2023-RO Patna (218701)-173 dated 27.05.2024..."
Output:
  { "references": "SPS/P-353/38,NH-12014/17/2023-RO Patna (218701)-173" }

### Example 4 — no real references
Input fragment:
  Subject: Construction update. We refer to the EPC Contract Agreement dated 26.02.2024.
Output:
  { "references": "" }

---

Now extract from the OCR text below. Re-check the output once before returning to catch the letter's own number being accidentally included.

OCR TEXT:
${truncated}
`;

    try {
        const response = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini",
            temperature: 0,
            response_format: { type: "json_object" },
        });
        return response;
    } catch (error) {
        console.error("processOpenAIRefill error:", error.message);
        return null;
    }
};

module.exports = { processOpenAIRefill, MAX_OCR_CHARS };
