import type { InputData, Stage1Output, ISQ, ExcelData } from "../types";

function normalizeSpecName(name: string): string {
  return name
    .toLowerCase()
    .replace(/sheet|plate|material/g, "")
    .replace(/perforation/g, "hole")
    .replace(/thk/g, "thickness")
    .replace(/type/g, "shape")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  baseDelay = 3000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) return response;

    if (response.status === 429 || response.status === 503 || response.status === 502) {
      if (attempt === retries) {
        throw new Error(`Gemini overloaded after ${retries + 1} attempts`);
      }
      const waitTime = baseDelay * Math.pow(2, attempt);
      console.warn(`Gemini overloaded (${response.status}). Retrying in ${waitTime}ms`);
      await sleep(waitTime);
      continue;
    }

    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  throw new Error("Unreachable");
}


function extractJSONFromGemini(response) {
  if (!response?.candidates?.length) {
    throw new Error("No candidates found in Gemini response");
  }

  const parts =
    response.candidates[0]?.content?.parts ||
    response.candidates[0]?.content ||
    [];

  let rawText = "";

  for (const part of parts) {
    if (typeof part.text === "string") {
      rawText += part.text + "\n";
    }

    if (part.json) {
      return part.json; 
    }
  }

  // Clean markdown wrappers
  let cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // Extract JSON block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) cleaned = match[0];

  // Fix trailing commas
  cleaned = cleaned.replace(/,(\s*[\]}])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("Gemini JSON parse failed: returning safe fallback.");

    return {
      seller_specs: [],
    };
  }
}


const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY || "").trim();

export async function generateStage1WithGemini(
  input: InputData
): Promise<Stage1Output> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file.");
  }

  const prompt = buildStage1Prompt(input);

  try {
   const response = await fetchWithRetry(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: "application/json"
      }
    })
  }
);

const data = await response.json();
return extractJSONFromGemini(data);


  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error: ${String(error)}`);
  }
}

export async function extractISQWithGemini(
  input: InputData,
  urls: string[]
): Promise<{ config: ISQ; keys: ISQ[]; buyers: ISQ[] }> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file.");
  }

  const urlContents = await Promise.all(urls.map(fetchURL));
  const prompt = buildISQExtractionPrompt(input, urls, urlContents);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || response.statusText;
      throw new Error(`Gemini API error: ${response.status} - ${errorMsg}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      throw new Error("No response from Gemini API");
    }

    const content = data.candidates[0].content.parts[0].text;

    const jsonStr = extractJSON(content);
    if (!jsonStr) {
      throw new Error("No valid JSON found in Gemini response");
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected error: ${String(error)}`);
  }
}

function extractJSON(text: string): string | null {

  // Start of function
text = text.replace(/```json|```/gi, "").trim();

  // First, try the whole text as-is (might be raw JSON)
  text = text.trim();
  if (text.startsWith('{')) {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Continue to other methods
    }
  }

  // Try markdown code block with json label
  let codeBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    try {
      JSON.parse(extracted);
      return extracted;
    } catch (e) {
      console.error("Failed to parse JSON from json code block:", e);
    }
  }

  // Try markdown code block without language
  codeBlockMatch = text.match(/```\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    try {
      JSON.parse(extracted);
      return extracted;
    } catch (e) {
      console.error("Failed to parse JSON from code block:", e);
    }
  }

  // Try to find JSON by looking for { and }
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let startIdx = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        if (braceCount === 0) startIdx = i;
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) {
          const jsonStr = text.substring(startIdx, i + 1).trim();
          try {
            JSON.parse(jsonStr);
            return jsonStr;
          } catch (e) {
            console.error("Failed to parse extracted JSON:", e);
            startIdx = -1;
          }
        }
      }
    }
  }

  // If nothing found, log the response for debugging
  console.error("No JSON found in response. Raw response:", text.substring(0, 1000));
  return null;
}

async function fetchURL(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    // Extract visible text from HTML
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  } catch {
    return "";
  }
}

function buildStage1Prompt(input: InputData): string {
  const mcatNames = input.mcats.map((m) => m.mcat_name).join(", ");
  return `For the product categories { ${input.pmcat_name}, ${mcatNames} }, identify their key product specifications for an **Indian B2B marketplace perspective**.
PMCAT Name: ${input.pmcat_name || "(blank)"}
PMCAT ID: ${input.pmcat_id || "(blank)"}
MCATs: ${mcatNames}

Return ONLY valid JSON.
Do NOT add explanation, notes, or text before or after JSON.
Output must start with { and end with }.

**Your entire analysis must follow these critical rules:**

* **Common Spec Name:** For each specification, use only the most common name used by sellers and buyers in the **Indian B2B market**.
* **Option Coverage:** Aim to cover the most common listings options that collectively cover at least 95% of the products and buyer inquiries for this category.
* **Character Length Constraint:** Spec values must be less than 25 characters in length

---

**1. The Classification Tier:**
* **Primary Specs (MIN 2, MAX 3):** Core differentiators with the highest impact on pricing and buyer comparison.
* **Secondary Specs (MIN 2, MAX 3):** Essential functional specifications that define the product's core capabilities and performance.
* **Tertiary Specs (MAX 4):** Supplementary details that provide complete product information and address detailed inquiries.

---

**2. The Input Type:**
* Determine the appropriate **"input_type"** based on these rules:
    * **radio_button:** Use if the specification has a fixed set of mutually exclusive values (e.g., Capacity: 2kg, 4kg, 6kg).
    * **multi_select:** Use if the specification allows for multiple non-exclusive values to be selected together (e.g., Features: Waterproof, Bluetooth, GPS).

---
**3. Common Rules for Spec Name:**
* **Avoid Spec Duplicity:** Do not include specifications that are duplicates. If two common terms exist, use only the most common one. 
* If a Spec is created with only one option and is important for the category product listings, then you must list it only under Tertiary. 
    > **Example**: Spec Name Extinguishing Agent: CO2 for category CO2 Fire Extinguisher.
* **Category Non-Adherence (Irrelevant Spec):** The specification must be **technically relevant and possible** for the product category. 


**4. Common Rules for Spec Options:**
* For every category, Provide a representative list of the most common values or options. This list is mandatory and must follow these rules:
    * **Order by Popularity:** The list **must be ordered by popularity** in the Indian B2B marketplace, from most common to least common. The list must be comprehensive enough to give sellers a good range of valid choices, capturing the most popular options.
    * **Avoid Ranges:** **Try to avoid range values until necessary. Only use a range if it is the industry standard for that specification with respect to that particular category.
    * **Consistent Format:** Ensure all options for a given specification maintain a **consistent format**.
    * **Character Length:** Each spec option value must be less than 25 characters.
    * **Provide Maximum 10 options for a given Specification Name**.If >10 are common, include the top 10 most frequent choices and omit long-tail.
    * **Unit Consistency:** Always provide the **primary, industry-standard unit** that is legal as per the govt standard in India for the category and ensure the unit **must be** consistent across the options for a spec.
    * **Secondary Unit:** If applicable, include the secondary unit (i.e., commonly spoken unit ) in parentheses for reference. 
    * **Example**: 
        > **Spec Name**: Door Height  
        **Primary Unit**: mm  
        **Secondary Unit**: ft  
        **Spec Value (with Secondary Unit)**: 2100 mm (7 ft)  
    * **Avoid Duplicate Option:** Every value within a single specification Option List must be unique. Check for identical values or different formats that represent the exact same underlying option.
    * **Category Non-Adherence (Irrelevant Option):** The option must be a valid option for the category and should logically fit with the category name . Avoid including irrelevant or obsolete options for the category.
    * **Example**: 
        > **Category Name**: Henna Hair Color  
        **Spec Name**: Form  
        **Spec Option**: Cone  

    * **Spec Non-Adherence (Absurd Option):** The option value must be technically feasible and logically consistent with the parent Specification Name. An option must not contradict the unit or nature of the specification. 
    * **Example**: 
        > **Spec Name**: Material  
        **Spec Option**: 100 kg

* **No option should be created with vague keywords like “custom”, “unbranded” , “other” etc. An option must always fit with the product of the category**  
    * **Example**: 
        > **Spec Name**: Brand Name  
        **Spec Option**: unbranded


**5. Standardize the specification names of the related categories. Ensure logically matching specs are named the same for all related categories:**

* **Rules:
Match on meaning, not exact words. Consider units, example values, and buyer intent.
1) Prefer the simplest, marketplace-friendly parent name (≤ 2–3 words).
2) Normalize obvious unit variants if trivial (kg vs kilogram), else leave values untouched.**

—

**5. Affix Flag (ONLY for PRIMARY specs):**
* **Affix Flag:** Determines if this specification should appear in product titles. Only PRIMARY specs can have affix flags.
    * **Suffix:** The spec should appear at the end of the product title
    * **Prefix:** The spec should appear at the beginning of the product title  
    * **None:** The spec should not appear in product titles
* **Affix Presence Flag:** Determines how the spec should be formatted in the title:
    * **"1" (Both Name and Value):** Include both spec name and value (e.g., "CO2 fire extinguisher weight 4kg")
    * **"0" (Value Only):** Include only the value (e.g., "CO2 fire extinguisher 4kg")
    * **"0" (No Affix):** No affix (when affix_flag is None)

**Affix Rules:**
- Only PRIMARY specifications can have affix flags (Suffix/Prefix)
- SECONDARY and TERTIARY specs must have affix_flag = None and affix_presence_flag = "0"

**Example Affix Usage:**
* **CO2 Fire Extinguisher:**
  - Primary spec "Weight" with values ["4kg", "6kg", "9kg"]
  - affix_flag = "Suffix", affix_presence_flag = "1"
  - Result: "CO2 Fire Extinguisher Weight 4kg"

---

### Final Instruction (STRICT OUTPUT)

Generate the finalized specs for EVERY child MCAT from the MCAT LIST provided above.

OUTPUT RULES (NON-NEGOTIABLE - CRITICAL)
- RESPOND WITH PURE JSON ONLY. Nothing else. No text before or after.
- ABSOLUTELY NO markdown code blocks, NO triple backticks, NO fenced code blocks, just raw JSON.
- ABSOLUTELY NO explanations, NO reasoning, NO preamble, NO conclusion text.
- Return ONE single JSON object that looks EXACTLY like the schema below.
- The output MUST include EVERY MCAT exactly once (no missing, no extras).
- DO NOT invent / renumber IDs. Each mcat_id MUST be copied exactly from the MCAT LIST above.
- category_name MUST match the MCAT LIST name exactly.

STRICT FORMAT RULES:
- Output must be a single JSON object only.
- Do not include markdown.
- Do not include text outside JSON.
- Do not wrap JSON in quotes.

REQUIRED JSON SCHEMA (match keys + nesting exactly)

{
 “seller_specs”: [
 {
  "pmcat_id": {{$json["pmcat_id"]}},
  "pmcat_name": "{{$json["pmcat_name"]}}",
  "mcats": [
    {
      "category_name": "<MCAT_NAME_FROM_LIST>",
      "mcat_id": <MCAT_ID_FROM_LIST>,
      "finalized_specs": {
        "finalized_primary_specs": {
          "specs": [
            {
              "spec_name": "<string>",
              "options": ["<val1>", "<val2>", "..."],
              "input_type": "radio_button" or "multi_select",
              "affix_flag": "None" or "Prefix" or "Suffix",
              "affix_presence_flag": "0" or "1"
            }
          ]
        },
        "finalized_secondary_specs": {
          "specs": [
            {
              "spec_name": "<string>",
              "options": ["<val1>", "<val2>", "..."],
              "input_type": "radio_button" or "multi_select",
              "affix_flag": "None",
              "affix_presence_flag": "0"
            }
          ]
        },
        "finalized_tertiary_specs": {
          "specs": [
            {
              "spec_name": "<string>",
              "options": ["<val1>", "<val2>", "..."],
              "input_type": "radio_button" or "multi_select",
              "affix_flag": "None",
              "affix_presence_flag": "0"
            }
          ]
        }
      }
    }
  ]
}
}`;
}

function buildISQExtractionPrompt(
  input: InputData,
  urls: string[],
  contents: string[]
): string {
  const urlsText = urls
    .map((url, i) => `URL ${i + 1}: ${url}\nContent: ${contents[i]}...`)
    .join("\n\n");

  return `Extract ISQs from these URLs for: ${input.mcats.map((m) => m.mcat_name).join(", ")}

${urlsText}

Extract:
1. CONFIG ISQ (exactly 1): Must influence price, options must match URLs exactly
2. KEY ISQs (exactly 3): Most repeated + category defining
3. BUYER ISQs (exactly 2): One must match Config ISQ name, no multi-select

STRICT RULES:
- DO NOT invent specs
- Extract ONLY specs that appear in AT LEAST 2 URLs
- If a spec appears in only 1 URL → IGNORE it
- If options differ, keep ONLY options that appear in AT LEAST 2 URLs
- Do NOT guess missing options
EXCLUSION: If spec is in MCAT Name (e.g., "Material"), exclude it.

REQUIREMENTS:
- Return ONLY valid JSON.
- Absolutely no text, notes, or markdown outside JSON.
- If you include examples, they must be inside JSON only.
- Output MUST start with { and end with }.
- If the JSON is split across lines or contains markdown, still return valid JSON object

RESPOND WITH PURE JSON ONLY - Nothing else. No markdown, no explanation, just raw JSON that looks exactly like this:
{
  "config": {"name": "...", "options": [...]},
  "keys": [{"name": "...", "options": [...]}, ...],
  "buyers": [{"name": "...", "options": [...]}, ...]
}`;
}

export async function generateExcel(
  stage1: Stage1Output,
  isqs: { config: ISQ; keys: ISQ[]; buyers: ISQ[] }
): Promise<ExcelData> {
  return {
    master_specs: extractSpecNames(stage1),
    website_evidence: isqs.keys.map((k) => ({ name: k.name, count: 1 })),
    final_isqs: [
      { type: "Config", ...isqs.config },
      ...isqs.keys.map((k) => ({ type: "Key", ...k })),
      ...isqs.buyers.map((b) => ({ type: "Buyer", ...b })),
    ],
  };
}

function extractSpecNames(stage1: Stage1Output): unknown[] {
  const specs: unknown[] = [];
  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs, finalized_tertiary_specs } =
        mcat.finalized_specs;
      finalized_primary_specs.specs.forEach((s) => specs.push({ name: s.spec_name, tier: "Primary" }));
      finalized_secondary_specs.specs.forEach((s) => specs.push({ name: s.spec_name, tier: "Secondary" }));
      finalized_tertiary_specs.specs.forEach((s) => specs.push({ name: s.spec_name, tier: "Tertiary" }));
    });
  });
  return specs;
}

export function compareResults(
  chatgptSpecs: Stage1Output,
  geminiSpecs: Stage1Output
): { common_specs: string[]; chatgpt_unique_specs: string[]; gemini_unique_specs: string[] } {
  const chatgptNames = extractAllSpecNames(chatgptSpecs);
  const geminiNames = extractAllSpecNames(geminiSpecs);

  const common = chatgptNames.filter(c =>
    geminiNames.some(g => normalizeSpecName(g) === normalizeSpecName(c))
  );

  const chatgptUnique = chatgptNames.filter(
    c => !geminiNames.some(g => normalizeSpecName(g) === normalizeSpecName(c))
  );

  const geminiUnique = geminiNames.filter(
    g => !chatgptNames.some(c => normalizeSpecName(g) === normalizeSpecName(c))
  );

  return {
    common_specs: [...new Set(common)],
    chatgpt_unique_specs: [...new Set(chatgptUnique)],
    gemini_unique_specs: [...new Set(geminiUnique)],
  };
}


function extractAllSpecNames(specs: Stage1Output): string[] {
  const names: string[] = [];
  specs.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs, finalized_tertiary_specs } =
        mcat.finalized_specs;
      finalized_primary_specs.specs.forEach((s) => names.push(s.spec_name));
      finalized_secondary_specs.specs.forEach((s) => names.push(s.spec_name));
      finalized_tertiary_specs.specs.forEach((s) => names.push(s.spec_name));
    });
  });
  return names;
}
