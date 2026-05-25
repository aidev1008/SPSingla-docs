const OpenAIApi = require("openai");

const openai = new OpenAIApi({ apiKey: process.env.OPENAI_API_KEY });

const processOpenAI = async (text) => {
  const prompt = `   

    NOTE:- Given the text extracted from the first page of a formal letter using Amazon Textract, transform it into a polished and professional letter format. The output should adhere to formal business communication standards, ensuring the following:
    Proper alignment: Ensure consistent margins and alignment for all elements, such as sender's and recipient's addresses, date, reference, salutation, body, and signature.

    “AFTER PROPER FORMATTING PLEASE PROCEED FURTHER”
    
    Extract and structure the following information from the given text in JSON object:
    1. Letter Number
    2. References
    3. Date
    4. Subject

    Return a JSON object with these keys:
    {
    "letter_number": "",
    "references": "",
    "date": "",
    "subject": "",
    "letter_type:"",
    }

    Rules and Clarifications :- 
    1. letter_number: Include only the first exact alphanumeric code in the specified format found in the document header and above Recipient's Address or Addressee Details. Ignore any prefixes like "Ref:" or "No:". 
    Example: SPSCPL/BSRDCL/GANGAPATH/22-23/109 , AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0127 , NH-12014/17/2023-RO Patna (218701)-15 etc.
    
    2. Extract only valid reference numbers found after the markers Ref:, ref:, or References: (case-insensitive). Reference numbers must not include prefixes, labels, or dates. Multiple references should be comma-separated without spaces. Exclude any prefixes or additional labels, and trim spaces within reference numbers if they exist. If no valid reference exists, return an empty string.

    Use stricter validation for extracting references. Look for valid alphanumeric patterns in the reference numbers with slashes (/), dashes (-), or numbers. Discard any generic terms or references like "EPC Contract Agreement" and other unrelated context. Make sure only valid references are included, following the specified formats.

     ### Input Examples and Expected Output:
     #### Case A
     Input:
     2a. Ref: 1. SPSCPL/BSRDCL/GANGAPATH/AE/22-23/253 dated 18.07.2023
            2. AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0118 dated 27.06.2023
            3. SPSCPL/BSRDCL/GANGAPATH/AE/22-23/237 dated 16.06.2023
            4. AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0113 dated 14.06.2023
            5. SPSCPL/BSRDCL/GANGAPATH/AE/22-23/232 dated 06.06.2023

      Expected Output:
      SPSCPL/BSRDCL/GANGAPATH/AE/22-23/253,AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0118,SPSCPL/BSRDCL/GANGAPATH/AE/22-23/237,AECOM-RODIC/BSRDCL/GANGAPATH/SPSCPL/23-24/0113,SPSCPL/BSRDCL/GANGAPATH/AE/22-23/232
 
     #### Case B
     Input:
     2b. Ref: 1. Our  Letter  No SPS/P-345/096  Dt  02'02 2023'
                2. Our  Letter  No SPS/P-345/1OO  Dt 10  02 2023'
                3: Our  Letter  No SPS/P-3 45t105 Dt 17  '02'2023'
                4. Our  Letter  No SPS/P-3 451119 Dl 11'04'2023'

     Expected Output:
     SPS/P-345/096,SPS/P-345/1OO,SPS/P-3 45t105,SPS/P-3 451119

    #### Case C
    Input:
    2c. References: 1. Our LOA Acceptance Letter No SPS / P – 354 / 002 dated 19.03.2024
                    2. Our Earlier Letter No SPS / P – 354 / 004 dated 25.04.2024, for submission of JV Agreement

    Expected Output:
    SPS/P–354/002,SPS/P–354/004

    #### Case D
    Input:
    2d. Ref: 1.   LOA. No. NH-12014/17/2023-RO Patna dated- 15.02.2024
                2.   Appointment Date- Letter No.: NH-12014/17/2023-RO Patna (218701)-162 Dtd. 01.05.2024
                3.   Our Office letter no. SPS/P-353/38, Dtd: 04.05.2024
                4.   Your Office letter NH-12014/17/2023-RO Patna (218701)-173, Dtd: 27.05.2024

    Expected Output:
    NH-12014/17/2023-RO Patna,NH-12014/17/2023-RO Patna (218701)-162,SPS/P-353/38,NH-12014/17/2023-RO Patna (218701)-173

    #### Case E
    Input:
    2e Ref: iii. This office letter No. 168 dated 15.05.2024
                iv.  M/s S.P Singla Constructions Pvt Ltd. Letter No. SPS/SITE/DS6L/75 dated 28.09.2024.

    Expected Output:
    SPS/SITE/DS6L/75

    #### Case F
    Input:
    2f Ref: 1. EPC Contract Agreement dated 26.02.2024

    Expected Output:
    ""

    ### Evaluation Criteria:
    1. Valid references must align with the formatting standards demonstrated in the GOOD examples.
    2. Trim unnecessary spaces within the references (e.g., "B / W .148 / 1 / 99723 / EPC / WA" → "B/W.148/1/99723/EPC/WA").
    3. Return an empty string ("") if no valid reference numbers are found.
    4. Discard invalid examples such as generic phrases ("Your Quotation dated 15.04.2022","EPC Contract Agreement dated 26.02.2024") or improperly formatted entries.

    ### Additional Notes:
    - Extract references accurately, avoiding unrelated text or labels.
    - Always ensure the output is comma-separated and free from extra spaces.
    - Expected results should adhere to GOOD examples of formatting.

    3. date : Strictly follow 'dd/mm/yyyy' format. Convert any other date formats encountered to this standard format.

    4. The subject should include the entire section starting with "Subject:", "Sub:", or "Sub-". Ensure to pick only the text starting with "Subject:", "Sub:", or "Sub-" and do not include any extra text.
    Examples: "Subject: Construction of 6 Lane H.L./Extra-dosed Cable bridge on River Ganga parallel to Western side (180 meter upstream) of Digha- Sonepur Rail-cum-Road bridge at Patna on Ganga River on NH-139W in the State of Bihar" , "Sub: Regarding day-to-day operation of cleaning& maintenance of road deck of Br"No. 7 (Digira Ganga
Rail Cum Road Brtdge) between Dighaghat - Pahlezaghat near Patna, on the river Ganga".

    5. Letter Type - if Letter No starts with SPS then it's an outgoing document, otherwise it’s an incoming document.

    7. Also, please re-check the result twice before returning the response to minimize mistakes.

    text:  ${text}.
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
    console.error("Error extracting information from OpenAI:", error);
    return null;
  }
};

module.exports = processOpenAI;
