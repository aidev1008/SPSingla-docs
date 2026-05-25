#!/usr/bin/env node
/*
  Tests whether gpt-3.5-turbo hallucinates the IRCON ref.
  Picks 3 bad-ref docs whose OCR does NOT mention IRCON, sends each through the
  EXACT existing production prompt (openai.helper.js), and prints what comes back.

  If the AI returns "IRCON/1039/HRBP(CRSP)/1/2022/1039/1471" for OCR text that
  doesn't contain that string anywhere → hallucination theory confirmed.

  Cost: 3 OpenAI calls, ~$0.003 total.
*/

require("dotenv").config();
const { Pool } = require("pg");
const processOpenAI = require("../app/helpers/openai.helper.js");

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === "false" ? false : true,
});

const BAD_REF = "IRCON/1039/HRBP(CRSP)/1/2022/1039/1471";

async function main() {
    const { rows } = await pool.query(
        `
        SELECT d.doc_id, d.doc_number, d.doc_folder, m.dm_ocr_content
        FROM   documents d
        JOIN   doc_metadata m ON m.dm_id = d.doc_number
        WHERE  d.doc_reference = $1
          AND  m.dm_ocr_content NOT ILIKE '%IRCON%'
          AND  LENGTH(m.dm_ocr_content) BETWEEN 1000 AND 20000
        ORDER  BY RANDOM()
        LIMIT  3
        `,
        [BAD_REF]
    );

    console.log(`\nTesting ${rows.length} docs against gpt-3.5-turbo + existing prompt...\n`);
    console.log("=".repeat(90));

    let hallucinated = 0;
    let returnedEmpty = 0;
    let returnedOther = 0;

    for (const doc of rows) {
        // Simulate first-page-only OCR by taking first 5000 chars (live pipeline runs Textract on page 1)
        const ocrFirstPage = doc.dm_ocr_content.slice(0, 5000);

        console.log(`\ndoc_id:     ${doc.doc_id}`);
        console.log(`doc_number: ${doc.doc_number}`);
        console.log(`folder:     ${doc.doc_folder}`);
        console.log(`OCR length sent: ${ocrFirstPage.length} chars`);
        console.log(`Contains "IRCON" in input: ${ocrFirstPage.includes("IRCON") ? "YES" : "no"}`);

        const resp = await processOpenAI(ocrFirstPage);
        if (!resp || !resp.choices || !resp.choices[0]) {
            console.log(`AI response: <null>`);
            continue;
        }

        let parsed;
        try {
            parsed = JSON.parse(resp.choices[0].message.content);
        } catch (e) {
            console.log(`AI returned non-JSON: ${resp.choices[0].message.content.slice(0, 200)}`);
            continue;
        }

        const refs = parsed.references || "";
        console.log(`AI returned letter_number: ${parsed.letter_number}`);
        console.log(`AI returned references:    "${refs}"`);

        if (refs === BAD_REF) {
            console.log(`>>> EXACT MATCH to bad IRCON ref <<<`);
            hallucinated++;
        } else if (refs === "") {
            console.log(`>>> Returned empty (correct behavior)`);
            returnedEmpty++;
        } else {
            console.log(`>>> Returned something else`);
            returnedOther++;
        }
        console.log("-".repeat(90));
    }

    console.log("\n=== SUMMARY ===");
    console.log(`Hallucinated IRCON ref exactly: ${hallucinated} / ${rows.length}`);
    console.log(`Returned empty (correct):       ${returnedEmpty} / ${rows.length}`);
    console.log(`Returned something else:        ${returnedOther} / ${rows.length}`);

    if (hallucinated > 0) {
        console.log("\nVerdict: Hallucination theory CONFIRMED.");
    } else if (returnedEmpty === rows.length) {
        console.log("\nVerdict: Hallucination theory DISPROVED — AI returned empty correctly.");
        console.log("The 18,763 bad values came from somewhere else. Need to investigate further.");
    } else {
        console.log("\nVerdict: Mixed result — AI hallucinates *some* refs but not the IRCON one.");
        console.log("Bug source may be different. Need to investigate further.");
    }

    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
