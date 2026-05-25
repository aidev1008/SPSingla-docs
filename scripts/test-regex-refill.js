#!/usr/bin/env node
/*
  Quick regex-based reference extractor — proof of concept.
  Picks 10 random docs with the bad reference, runs regex on their cached OCR,
  and prints what the regex extracts. No DB writes, no API calls.

  Usage: node scripts/test-regex-refill.js
*/

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === "true",
});

const BAD_REFERENCE = "IRCON/1039/HRBP(CRSP)/1/2022/1039/1471";

function extractReferences(ocrText, ownDocNumber) {
    if (!ocrText) return [];

    const candidates = new Set();

    // Pattern A: anything after a "Ref:" / "References:" header up to the next major section
    const refHeaderRe = /\b(?:Ref(?:erence)?s?)\s*[:.\-]\s*([^]*?)(?=\b(?:Subject|Sub|Dear\s+Sir|Dear\s+Madam|To\s*,|To\s+The|Yours\s+faithfully)\b|$)/gi;
    let m;
    while ((m = refHeaderRe.exec(ocrText)) !== null) {
        const block = m[1].slice(0, 800); // cap the block size
        // Extract codes (alphanumeric with /, -, parens, digits)
        const codeRe = /\b([A-Z0-9][A-Z0-9/\-().]{2,}[A-Z0-9)])\b/g;
        let c;
        while ((c = codeRe.exec(block)) !== null) {
            candidates.add(c[1]);
        }
        // Also pure numeric IDs (3+ digits) — common for incoming letters
        const numRe = /\b(\d{3,6})\b/g;
        while ((c = numRe.exec(block)) !== null) {
            candidates.add(c[1]);
        }
    }

    // Pattern B: inline "letter no. X" / "letter No.: X" / "vide letter no. X"
    const inlineRe = /(?:vide\s+)?(?:our\s+|your\s+|this\s+|the\s+|earlier\s+|office\s+)?(?:office\s+)?letter[s]?\s*(?:no\.?|No\.?|number)\s*[:.]?\s*([A-Z0-9][A-Z0-9/\-().\s]{2,40}?)(?=\s*(?:dated|Dt\.?|Dtd\.?|Dl\.?|,|\.|;|\s+and\s+|\s+&\s+|$))/gi;
    while ((m = inlineRe.exec(ocrText)) !== null) {
        const code = m[1].trim().replace(/\s+/g, "");
        if (code.length >= 3) candidates.add(code);
    }

    // Pattern C: "Letter No X" without colon (last-resort)
    const looseRe = /\bletter\s+no\.?\s+([A-Z]{2,}[A-Z0-9/\-]{2,})\b/gi;
    while ((m = looseRe.exec(ocrText)) !== null) {
        candidates.add(m[1].replace(/\s+/g, ""));
    }

    // Filter
    const ownStripped = (ownDocNumber || "").replace(/\s+/g, "").toLowerCase();
    const stopWords = new Set([
        "EPC", "LOA", "RFP", "AGREEMENT", "CONTRACT", "TENDER",
        "DOCUMENT", "DATED", "LETTER", "OFFICE", "REF", "REFERENCE",
        "NO", "NUMBER", "DT", "DTD",
    ]);

    const cleaned = [...candidates]
        .map((c) => c.replace(/\s+/g, "").replace(/[.,;]+$/, ""))
        .filter((c) => c.length >= 3)
        .filter((c) => !stopWords.has(c.toUpperCase()))
        .filter((c) => c.toLowerCase() !== ownStripped)
        // must contain a slash, dash, or be a 3-6 digit number
        .filter((c) => /[\/\-]/.test(c) || /^\d{3,6}$/.test(c))
        // drop dates that look like 06.01.2026 etc
        .filter((c) => !/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test(c));

    return [...new Set(cleaned)];
}

async function main() {
    const { rows } = await pool.query(
        `
        SELECT d.doc_id, d.doc_number, d.doc_folder, m.dm_ocr_content
        FROM   documents d
        JOIN   doc_metadata m ON m.dm_id = d.doc_number
        WHERE  d.doc_reference = $1
          AND  LENGTH(m.dm_ocr_content) BETWEEN 1000 AND 50000
        ORDER  BY RANDOM()
        LIMIT  10
        `,
        [BAD_REFERENCE]
    );

    console.log(`Sampled ${rows.length} bad-ref docs.\n`);
    console.log("=".repeat(80));

    for (const doc of rows) {
        const refs = extractReferences(doc.dm_ocr_content, doc.doc_number);
        console.log(`doc_id:     ${doc.doc_id}`);
        console.log(`doc_number: ${doc.doc_number}`);
        console.log(`folder:     ${doc.doc_folder}`);
        console.log(`OCR length: ${doc.dm_ocr_content.length} chars`);
        console.log(`Extracted:  ${refs.length > 0 ? refs.join(", ") : "(none)"}`);

        // Show a snippet of the OCR around the first "Ref" or "letter no" match for sanity check
        const idx = doc.dm_ocr_content.search(/Ref\s*[:.]|letter\s+no/i);
        if (idx >= 0) {
            const snippet = doc.dm_ocr_content
                .slice(Math.max(0, idx - 50), idx + 250)
                .replace(/\s+/g, " ");
            console.log(`Snippet:    ...${snippet}...`);
        }
        console.log("-".repeat(80));
    }

    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
