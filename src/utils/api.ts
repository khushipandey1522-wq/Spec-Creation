import type { InputData, Stage1Output, ISQ, ExcelData } from "../types";

function normalizeSpecName(name: string): string {
  // Fix: Handle cases where name might not be a string
  if (!name || typeof name !== 'string') {
    return '';
  }
  
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
  retries = 2,
  baseDelay = 5000
): Promise<Response> {
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) return response;

    lastStatus = response.status;

    if (response.status === 429 || response.status === 503 || response.status === 502) {
      if (attempt === retries) {
        throw new Error(`Gemini overloaded after ${retries + 1} attempts. Last status code: ${lastStatus}`);
      }
      const waitTime = baseDelay * Math.pow(2, attempt);
      console.warn(`Gemini overloaded (${response.status}). Retrying in ${waitTime}ms`);
      await sleep(waitTime);
      continue;
    }

    const err = await response.text();
    throw new Error(`Gemini API error ${lastStatus}: ${err}`);
  }

  throw new Error("Unreachable");
}

function extractJSONFromGemini(response: any): any {
  try {
    if (!response?.candidates?.length) {
      console.warn("No candidates in response, returning null for fallback");
      return null;
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

    if (!rawText.trim()) {
      console.warn("No text content in response, returning null for fallback");
      return null;
    }

    let cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    cleaned = cleaned.replace(/,(\s*[\]}])/g, "$1");

    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn("JSON parse failed, returning null for fallback:", parseErr);
      return null;
    }
  } catch (error) {
    console.warn("Unexpected error in extractJSONFromGemini:", error);
    return null;
  }
}

const STAGE1_API_KEY = (import.meta.env.VITE_STAGE1_API_KEY || "").trim();
const STAGE2_API_KEY = (import.meta.env.VITE_STAGE2_API_KEY || "").trim();
const STAGE3_API_KEY = (import.meta.env.VITE_STAGE3_API_KEY || "").trim();

export async function generateStage1WithGemini(
  input: InputData
): Promise<Stage1Output> {
  if (!STAGE1_API_KEY) {
    throw new Error("Stage 1 API key is not configured. Please add VITE_STAGE1_API_KEY to your .env file.");
  }

  const prompt = buildStage1Prompt(input);

  try {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${STAGE1_API_KEY}`,
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
    return extractJSONFromGemini(data) || generateFallbackStage1();

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes("429") || errorMsg.includes("quota")) {
      console.error("Stage 1 API Key quota exhausted or rate limited");
      throw new Error("Stage 1 API key quota exhausted. Please check your API limits.");
    }

    console.warn("Stage 1 API error:", error);
    return generateFallbackStage1();
  }
}

function generateFallbackStage1(): Stage1Output {
  return {
    seller_specs: []
  };
}

// ========== STAGE 2 - EXTRACTION ONLY (NO BUYER ISQs) ==========

export async function extractISQWithGemini(
  input: InputData,
  urls: string[]
): Promise<{ config: ISQ; keys: ISQ[]; buyers: ISQ[] }> {
  // FIX: Stage 2 should NOT return Buyer ISQs - return empty array
  if (!STAGE2_API_KEY) {
    throw new Error("Stage 2 API key is not configured. Please add VITE_STAGE2_API_KEY to your .env file.");
  }

  console.log("Stage 2: Starting 3-prompt validation system...");
  await sleep(5000);

  try {
    // First attempt with detailed prompt
    const result = await attemptExtraction(input, urls, "first");
    
    if (result && isValidISQSet(result)) {
      console.log("Stage 2: First attempt successful");
      return { ...result, buyers: [] }; // Empty buyers array
    }

    console.log("Stage 2: First attempt failed, trying validation prompt...");
    await sleep(3000);
    
    // Second attempt with validation-focused prompt
    const validatedResult = await attemptExtraction(input, urls, "validation");
    
    if (validatedResult && isValidISQSet(validatedResult)) {
      console.log("Stage 2: Validation attempt successful");
      return { ...validatedResult, buyers: [] }; // Empty buyers array
    }

    console.log("Stage 2: Validation failed, trying fallback prompt...");
    await sleep(3000);
    
    // Third attempt with fallback simplified prompt
    const fallbackResult = await attemptExtraction(input, urls, "fallback");
    
    if (fallbackResult && isValidISQSet(fallbackResult)) {
      console.log("Stage 2: Fallback attempt successful");
      return { ...fallbackResult, buyers: [] }; // Empty buyers array
    }

    console.log("Stage 2: All attempts failed, using text-based extraction");
    const textResult = await extractFromURLsDirectly(urls);
    if (textResult && isValidISQSet(textResult)) {
      return { ...textResult, buyers: [] }; // Empty buyers array
    }

    // Return fallback with empty buyers array
    return generateFallbackStage2();

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes("429") || errorMsg.includes("quota")) {
      console.error("Stage 2 API Key quota exhausted or rate limited");
      throw new Error("Stage 2 API key quota exhausted. Please check your API limits.");
    }

    console.warn("Stage 2 API error:", error);
    
    // Try direct extraction as last resort
    try {
      const directResult = await extractFromURLsDirectly(urls);
      if (directResult && isValidISQSet(directResult)) {
        return { ...directResult, buyers: [] }; // Empty buyers array
      }
    } catch (e) {
      console.error("Direct extraction also failed:", e);
    }

    return generateFallbackStage2();
  }
}

async function attemptExtraction(
  input: InputData,
  urls: string[],
  attemptType: "first" | "validation" | "fallback"
): Promise<{ config: ISQ; keys: ISQ[] } | null> {
  const urlContents = await Promise.all(urls.map(fetchURL));
  
  let prompt: string;
  switch (attemptType) {
    case "first":
      prompt = buildISQExtractionPromptFirst(input, urls, urlContents);
      break;
    case "validation":
      prompt = buildISQExtractionPromptValidation(input, urls, urlContents);
      break;
    case "fallback":
      prompt = buildISQExtractionPromptFallback(input, urls, urlContents);
      break;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${STAGE2_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: attemptType === "fallback" ? 0.3 : 0.7,
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const parsed = extractJSONFromGemini(data);

    if (parsed && parsed.config && parsed.config.name && parsed.keys && Array.isArray(parsed.keys)) {
      // Ensure no duplicate specs
      const uniqueKeys = removeDuplicateSpecs(parsed.keys, parsed.config.name);
      
      return {
        config: {
          name: String(parsed.config.name || ""),
          options: Array.isArray(parsed.config.options) ? parsed.config.options.map(String) : []
        },
        keys: uniqueKeys.slice(0, 3).map(key => ({
          name: String(key.name || ""),
          options: Array.isArray(key.options) ? key.options.map(String) : []
        }))
      };
    }

    return null;
  } catch (error) {
    console.warn(`Stage 2 ${attemptType} attempt failed:`, error);
    return null;
  }
}

function removeDuplicateSpecs(keys: ISQ[], configName: string): ISQ[] {
  const seen = new Set<string>();
  const unique: ISQ[] = [];
  
  // Normalize config name
  const normalizedConfigName = normalizeSpecName(String(configName || ""));
  seen.add(normalizedConfigName);
  
  for (const key of keys) {
    const normalizedKeyName = normalizeSpecName(String(key.name || ""));
    if (!seen.has(normalizedKeyName)) {
      seen.add(normalizedKeyName);
      unique.push({
        name: String(key.name || ""),
        options: Array.isArray(key.options) ? key.options.map(String) : []
      });
    }
  }
  
  return unique;
}

function isValidISQSet(result: { config: ISQ; keys: ISQ[] }): boolean {
  // Fix: Ensure all properties are strings
  if (!result.config || !result.config.name || typeof result.config.name !== 'string') {
    return false;
  }
  
  if (!Array.isArray(result.config.options) || result.config.options.length < 2) {
    return false;
  }
  
  if (!result.keys || !Array.isArray(result.keys) || result.keys.length < 3) {
    return false;
  }
  
  // Check for duplicates
  const allNames = [result.config.name, ...result.keys.map(k => k.name)];
  const normalizedNames = allNames.map(name => normalizeSpecName(String(name || "")));
  const uniqueNames = new Set(normalizedNames);
  
  if (uniqueNames.size !== allNames.length) {
    return false;
  }
  
  // Check each key has at least 2 options
  for (const key of result.keys) {
    if (!key.name || typeof key.name !== 'string' || !Array.isArray(key.options) || key.options.length < 2) {
      return false;
    }
  }
  
  return true;
}

async function extractFromURLsDirectly(urls: string[]): Promise<{ config: ISQ; keys: ISQ[] } | null> {
  console.warn("Stage2: Using direct text-based extraction");
  
  const urlContents = await Promise.all(urls.map(fetchURL));
  const allText = urlContents.join("\n---\n");
  
  const config = { name: "", options: [] as string[] };
  const keys: ISQ[] = [];
  
  // Common specification patterns for Indian B2B
  const specPatterns = [
    /(material|grade)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(thickness|thk|gauge)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(size|dimension)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(length|width|height)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(type|shape|form)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(finish|surface|coating)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(brand|make|manufacturer)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(capacity|weight|load)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(color|colour)[^:\n]*[:\-\s]+([^\n]+)/gi,
    /(standard|certification)[^:\n]*[:\-\s]+([^\n]+)/gi
  ];
  
  const specFrequency: Map<string, { name: string; values: Set<string>; count: number }> = new Map();
  
  // Analyze each URL separately
  for (let i = 0; i < urlContents.length; i++) {
    const content = urlContents[i];
    const urlSpecs = new Set<string>();
    
    for (const pattern of specPatterns) {
      const matches = Array.from(content.matchAll(pattern));
      for (const match of matches) {
        const specName = match[1].trim().toLowerCase();
        const valuesStr = match[2].trim();
        
        if (!urlSpecs.has(specName)) {
          urlSpecs.add(specName);
          
          const values = valuesStr
            .split(/[,;\/|&]|\band\b/)
            .map(v => v.trim())
            .filter(v => v.length > 0 && v.length < 50);
          
          if (values.length > 0) {
            const key = specName;
            if (!specFrequency.has(key)) {
              specFrequency.set(key, {
                name: match[1].trim(),
                values: new Set(),
                count: 0
              });
            }
            
            const specData = specFrequency.get(key)!;
            specData.count++;
            values.forEach(v => specData.values.add(v));
          }
        }
      }
    }
  }
  
  // Filter specs that appear in at least 2 URLs
  const validSpecs = Array.from(specFrequency.entries())
    .filter(([_, data]) => data.count >= 2 && data.values.size >= 2)
    .map(([_, data]) => ({
      name: data.name,
      options: Array.from(data.values).slice(0, 10),
      frequency: data.count
    }))
    .sort((a, b) => b.frequency - a.frequency);
  
  if (validSpecs.length === 0) {
    return null;
  }
  
  // Select config ISQ (most frequent, price-influencing)
  config.name = validSpecs[0].name;
  config.options = validSpecs[0].options.slice(0, 8);
  
  // Select key ISQs (next 3 most frequent, excluding config)
  for (let i = 1; i < Math.min(4, validSpecs.length); i++) {
    if (normalizeSpecName(validSpecs[i].name) !== normalizeSpecName(config.name)) {
      keys.push({
        name: validSpecs[i].name,
        options: validSpecs[i].options.slice(0, 8)
      });
    }
  }
  
  // If we don't have 3 keys, try to get more
  if (keys.length < 3 && validSpecs.length > 4) {
    for (let i = 4; i < validSpecs.length && keys.length < 3; i++) {
      if (normalizeSpecName(validSpecs[i].name) !== normalizeSpecName(config.name)) {
        const alreadyExists = keys.some(k => 
          normalizeSpecName(k.name) === normalizeSpecName(validSpecs[i].name)
        );
        if (!alreadyExists) {
          keys.push({
            name: validSpecs[i].name,
            options: validSpecs[i].options.slice(0, 8)
          });
        }
      }
    }
  }
  
  if (config.name && config.options.length >= 2 && keys.length >= 3) {
    return { config, keys };
  }
  
  return null;
}

// ========== STAGE 2 PROMPTS (3-LAYER SYSTEM) ==========

function buildISQExtractionPromptFirst(
  input: InputData,
  urls: string[],
  contents: string[]
): string {
  const urlSummaries = urls.map((url, i) => 
    `URL ${i+1}: ${url}\nContent Preview: "${contents[i].substring(0, 800)}..."`
  ).join('\n\n---\n\n');

  return `EXTRACT SPECIFICATIONS FOR INDIAN B2B MARKETPLACE

MCAT CATEGORIES: ${input.mcats.map(m => m.mcat_name).join(', ')}

URL CONTENT:
${urlSummaries}

========== RULES ==========

1. EXTRACT CONFIG ISQ (1 SPECIFICATION):
   - Choose ONE specification that MOST affects PRICE
   - Must appear in AT LEAST 2 different URLs
   - Must have AT LEAST 2 options that appear in multiple URLs
   - Examples: Material Grade, Thickness, Capacity

2. EXTRACT KEY ISQs (3 SPECIFICATIONS):
   - Choose THREE most frequently mentioned specifications
   - Must appear in AT LEAST 2 different URLs  
   - Each must have AT LEAST 2 options
   - Must be DIFFERENT from Config ISQ
   - Examples: Size, Finish, Brand, Certification

3. STRICT FORMATTING:
   - NO Buyer ISQs (only Config + 3 Keys)
   - NO duplicates
   - Use common Indian B2B terms
   - Copy options EXACTLY from URLs

========== OUTPUT FORMAT ==========
{
  "config": {
    "name": "Material Grade",
    "options": ["304", "316", "304L"]
  },
  "keys": [
    {"name": "Thickness", "options": ["2mm", "3mm", "4mm"]},
    {"name": "Size", "options": ["1/2 inch", "3/4 inch", "1 inch"]},
    {"name": "Finish", "options": ["Polished", "Brushed", "Matte"]}
  ]
}

Return ONLY the JSON. No explanations.`;
}

function buildISQExtractionPromptValidation(
  input: InputData,
  urls: string[],
  contents: string[]
): string {
  const urlSummaries = urls.map((url, i) => 
    `URL ${i+1}: ${url}\nFirst 600 chars: "${contents[i].substring(0, 600)}"`
  ).join('\n\n');

  return `VALIDATION MODE: Extract Config ISQ + 3 Key ISQs

CATEGORIES: ${input.mcats.map(m => m.mcat_name).join(', ')}

URLS TO ANALYZE:
${urlSummaries}

CRITICAL RULES:
1. Config ISQ = Most price-sensitive spec (e.g., Grade, Thickness, Capacity)
2. Key ISQs = Next 3 most important specs
3. ALL specs must appear in ≥2 URLs
4. ALL specs must have ≥2 options from URLs
5. NO duplicates between Config and Keys

IMPORTANT: Do NOT include Buyer ISQs in this stage.

FINAL OUTPUT MUST BE JSON:
{
  "config": {"name": "SpecName", "options": ["opt1", "opt2"]},
  "keys": [
    {"name": "Spec1", "options": ["a", "b"]},
    {"name": "Spec2", "options": ["c", "d"]},
    {"name": "Spec3", "options": ["e", "f"]}
  ]
}

JSON only. No other text.`;
}

function buildISQExtractionPromptFallback(
  input: InputData,
  urls: string[],
  contents: string[]
): string {
  const simpleSummary = urls.map((url, i) => 
    `URL ${i+1}: First 400 chars: "${contents[i].substring(0, 400)}..."`
  ).join('\n\n');

  return `SIMPLE EXTRACTION: Find specifications in URLs.

ANALYZE:
${simpleSummary}

FIND:
1. One MAIN specification (affects price most)
2. Three OTHER important specifications

FORMAT:
{
  "config": {"name": "MainSpec", "options": ["opt1", "opt2"]},
  "keys": [
    {"name": "Spec1", "options": ["a", "b"]},
    {"name": "Spec2", "options": ["c", "d"]},
    {"name": "Spec3", "options": ["e", "f"]}
  ]
}

Just the JSON.`;
}

function generateFallbackStage2(): { config: ISQ; keys: ISQ[]; buyers: ISQ[] } {
  return {
    config: { name: "Material Grade", options: ["304", "316", "304L"] },
    keys: [
      { name: "Thickness", options: ["2mm", "3mm", "4mm"] },
      { name: "Size", options: ["1/2 inch", "3/4 inch", "1 inch"] },
      { name: "Finish", options: ["Polished", "Brushed", "Matte"] }
    ],
    buyers: [] // Empty array for Stage 2
  };
}

// ========== STAGE 3 - BUYER ISQ SELECTION ONLY ==========

export function selectStage3BuyerISQs(
  stage1: Stage1Output,
  stage2: { config: ISQ; keys: ISQ[]; buyers?: ISQ[] }
): ISQ[] {
  console.log("Stage 3: Selecting Buyer ISQs from common specifications...");
  
  // 1. Extract all specs from Stage 1 with tier info
  const stage1All: (ISQ & { tier: 'Primary' | 'Secondary' | 'Tertiary'; normName: string })[] = [];
  
  stage1.seller_specs.forEach(ss => {
    ss.mcats.forEach(mcat => {
      // Primary specs
      mcat.finalized_specs.finalized_primary_specs.specs.forEach(s => {
        // Fix: Ensure spec_name is a string
        const specName = String(s.spec_name || "");
        stage1All.push({ 
          name: specName, 
          options: Array.isArray(s.options) ? s.options.map(String) : [], 
          tier: 'Primary', 
          normName: normalizeSpecName(specName)
        });
      });
      
      // Secondary specs
      mcat.finalized_specs.finalized_secondary_specs.specs.forEach(s => {
        const specName = String(s.spec_name || "");
        stage1All.push({ 
          name: specName, 
          options: Array.isArray(s.options) ? s.options.map(String) : [], 
          tier: 'Secondary', 
          normName: normalizeSpecName(specName)
        });
      });
      
      // Tertiary specs (for completeness)
      mcat.finalized_specs.finalized_tertiary_specs.specs.forEach(s => {
        const specName = String(s.spec_name || "");
        stage1All.push({ 
          name: specName, 
          options: Array.isArray(s.options) ? s.options.map(String) : [], 
          tier: 'Tertiary', 
          normName: normalizeSpecName(specName)
        });
      });
    });
  });
  
  // 2. Extract all specs from Stage 2 (Config + Keys)
  const stage2All: (ISQ & { normName: string })[] = [
    stage2.config,
    ...stage2.keys
  ].map(s => ({ 
    name: String(s.name || ""),
    options: Array.isArray(s.options) ? s.options.map(String) : [],
    normName: normalizeSpecName(String(s.name || ""))
  }));
  
  // 3. Find common specifications (intersection)
  const commonSpecs: (ISQ & { 
    tier: 'Primary' | 'Secondary' | 'Tertiary'; 
    stage1Options: string[]; 
    stage2Options: string[] 
  })[] = [];
  
  stage1All.forEach(s1 => {
    const s2Match = stage2All.find(s2 => s2.normName === s1.normName);
    if (s2Match && s1.normName) {
      commonSpecs.push({
        name: s1.name,
        options: [], // Will be filled based on priority
        tier: s1.tier,
        normName: s1.normName,
        stage1Options: s1.options,
        stage2Options: s2Match.options
      });
    }
  });
  
  console.log(`Found ${commonSpecs.length} common specifications`);
  
  // 4. Select exactly 2 Buyer ISQs with priority order
  const buyerISQs: ISQ[] = [];
  
  // Priority 1: Primary tier common specs that are also in Stage 2
  const primaryCommonSpecs = commonSpecs.filter(s => s.tier === 'Primary');
  
  // Priority 2: Secondary tier common specs
  const secondaryCommonSpecs = commonSpecs.filter(s => s.tier === 'Secondary');
  
  // Priority 3: Any common specs
  const otherCommonSpecs = commonSpecs.filter(s => s.tier === 'Tertiary');
  
  // Selection logic
  let selectedSpecs = [];
  
  // Try to get 2 Primary specs
  if (primaryCommonSpecs.length >= 2) {
    selectedSpecs = primaryCommonSpecs.slice(0, 2);
  } 
  // Try 1 Primary + 1 Secondary
  else if (primaryCommonSpecs.length === 1 && secondaryCommonSpecs.length >= 1) {
    selectedSpecs = [primaryCommonSpecs[0], secondaryCommonSpecs[0]];
  }
  // Try 2 Secondary
  else if (secondaryCommonSpecs.length >= 2) {
    selectedSpecs = secondaryCommonSpecs.slice(0, 2);
  }
  // Try 1 Secondary + 1 other
  else if (secondaryCommonSpecs.length === 1 && otherCommonSpecs.length >= 1) {
    selectedSpecs = [secondaryCommonSpecs[0], otherCommonSpecs[0]];
  }
  // Try any 2 specs
  else if (commonSpecs.length >= 2) {
    selectedSpecs = commonSpecs.slice(0, 2);
  }
  
  // Create Buyer ISQs from selected specs
  selectedSpecs.forEach(spec => {
    buyerISQs.push(createBuyerISQ(spec));
  });
  
  // If still don't have 2, create fallback
  if (buyerISQs.length < 2) {
    const fallbackSpecs = [
      { name: "Material Grade", stage1Options: ["304", "316"], stage2Options: ["304", "316"] },
      { name: "Thickness", stage1Options: ["2mm", "3mm"], stage2Options: ["2mm", "3mm"] }
    ];
    
    while (buyerISQs.length < 2) {
      const spec = fallbackSpecs[buyerISQs.length];
      buyerISQs.push({
        name: spec.name,
        options: Array.from(new Set([...spec.stage1Options, ...spec.stage2Options])).slice(0, 8)
      });
    }
  }
  
  console.log(`Selected ${buyerISQs.length} Buyer ISQs for Stage 3`);
  return buyerISQs;
}

function createBuyerISQ(spec: {
  name: string;
  stage1Options: string[];
  stage2Options: string[];
}): ISQ {
  // Priority order for options:
  // 1. Options present in BOTH Stage 1 and Stage 2 (highest priority)
  // 2. Options present ONLY in Stage 2
  // 3. Options present ONLY in Stage 1 (lowest priority)
  
  const commonOptions = spec.stage2Options.filter(opt => 
    spec.stage1Options.includes(opt)
  );
  
  const stage2OnlyOptions = spec.stage2Options.filter(opt => 
    !commonOptions.includes(opt)
  );
  
  const stage1OnlyOptions = spec.stage1Options.filter(opt => 
    !commonOptions.includes(opt) && !stage2OnlyOptions.includes(opt)
  );
  
  const allOptions = [
    ...commonOptions,
    ...stage2OnlyOptions,
    ...stage1OnlyOptions
  ];
  
  // Deduplicate and limit to 8
  const uniqueOptions = Array.from(new Set(allOptions)).slice(0, 8);
  
  return {
    name: spec.name,
    options: uniqueOptions.length > 0 ? uniqueOptions : ['Standard Option 1', 'Standard Option 2']
  };
}

// ========== GEMINI PROMPT FOR STAGE 3 BUYER ISQs ==========

export async function generateStage3BuyerISQsWithGemini(
  stage1Data: Stage1Output,
  stage2ISQs: { config: ISQ; keys: ISQ[] },
  commonSpecNames: string[]
): Promise<ISQ[]> {
  if (!STAGE3_API_KEY) {
    console.log("Stage 3 API key not configured, using local selection");
    return selectStage3BuyerISQs(stage1Data, stage2ISQs);
  }

  try {
    console.log("Calling Gemini for Stage 3 Buyer ISQ selection...");
    
    // Prepare data for prompt
    const stage1Specs = extractStage1SpecsForPrompt(stage1Data);
    const stage2Specs = extractStage2SpecsForPrompt(stage2ISQs);
    
    const prompt = buildStage3BuyerPrompt(
      stage1Specs,
      stage2Specs,
      commonSpecNames
    );
    
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${STAGE3_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2, // Low temperature for consistent output
            maxOutputTokens: 2048,
            responseMimeType: "application/json"
          }
        })
      }
    );
    
    const data = await response.json();
    const parsed = extractJSONFromGemini(data);
    
    if (parsed && parsed.buyer_isqs && Array.isArray(parsed.buyer_isqs)) {
      // Validate and format the response
      const validISQs = parsed.buyer_isqs
        .filter((isq: any) => isq && isq.name && typeof isq.name === 'string')
        .slice(0, 2)
        .map((isq: any) => ({
          name: String(isq.name),
          options: Array.isArray(isq.options) ? 
                   isq.options.map(String).slice(0, 8) : 
                   ['Option 1', 'Option 2']
        }));
      
      if (validISQs.length === 2) {
        console.log("Gemini successfully generated Buyer ISQs for Stage 3");
        return validISQs;
      }
    }
    
    // Fallback to local selection
    console.log("Gemini failed, using local Buyer ISQ selection");
    return selectStage3BuyerISQs(stage1Data, stage2ISQs);
    
  } catch (error) {
    console.error("Stage 3 Gemini call failed:", error);
    return selectStage3BuyerISQs(stage1Data, stage2ISQs);
  }
}

function extractStage1SpecsForPrompt(stage1Data: Stage1Output): Array<{
  name: string;
  tier: string;
  options: string[];
}> {
  const specs: Array<{ name: string; tier: string; options: string[] }> = [];
  
  stage1Data.seller_specs.forEach(ss => {
    ss.mcats.forEach(mcat => {
      // Primary specs
      mcat.finalized_specs.finalized_primary_specs.specs.forEach(s => {
        specs.push({
          name: String(s.spec_name || ""),
          tier: "Primary",
          options: Array.isArray(s.options) ? s.options.map(String) : []
        });
      });
      
      // Secondary specs
      mcat.finalized_specs.finalized_secondary_specs.specs.forEach(s => {
        specs.push({
          name: String(s.spec_name || ""),
          tier: "Secondary",
          options: Array.isArray(s.options) ? s.options.map(String) : []
        });
      });
    });
  });
  
  return specs;
}

function extractStage2SpecsForPrompt(stage2ISQs: { config: ISQ; keys: ISQ[] }): ISQ[] {
  return [
    stage2ISQs.config,
    ...stage2ISQs.keys
  ].map(spec => ({
    name: String(spec.name || ""),
    options: Array.isArray(spec.options) ? spec.options.map(String) : []
  }));
}

function buildStage3BuyerPrompt(
  stage1Specs: Array<{ name: string; tier: string; options: string[] }>,
  stage2Specs: ISQ[],
  commonSpecNames: string[]
): string {
  // Group Stage 1 specs by name (keeping highest tier)
  const stage1Map = new Map<string, { tier: string; options: string[] }>();
  stage1Specs.forEach(spec => {
    const existing = stage1Map.get(spec.name);
    if (!existing || (spec.tier === 'Primary' && existing.tier !== 'Primary')) {
      stage1Map.set(spec.name, { tier: spec.tier, options: spec.options });
    }
  });
  
  // Group Stage 2 specs by normalized name
  const stage2Map = new Map<string, string[]>();
  stage2Specs.forEach(spec => {
    const normName = normalizeSpecName(spec.name);
    if (!stage2Map.has(normName)) {
      stage2Map.set(normName, spec.options);
    }
  });
  
  // Create detailed common specs list
  const commonSpecsDetailed = commonSpecNames
    .filter(name => name && typeof name === 'string')
    .map(specName => {
      const stage1Data = stage1Map.get(specName);
      const normName = normalizeSpecName(specName);
      const stage2Data = stage2Map.get(normName);
      
      return {
        name: specName,
        tier: stage1Data?.tier || 'Unknown',
        stage1Options: stage1Data?.options || [],
        stage2Options: stage2Data || []
      };
    })
    .filter(spec => spec.stage1Options.length > 0 || spec.stage2Options.length > 0);
  
  const commonSpecsText = commonSpecsDetailed
    .map(spec => `- ${spec.name} (${spec.tier})
  Stage 1 Options: ${spec.stage1Options.slice(0, 5).join(', ')}${spec.stage1Options.length > 5 ? '...' : ''}
  Stage 2 Options: ${spec.stage2Options.slice(0, 5).join(', ')}${spec.stage2Options.length > 5 ? '...' : ''}`)
    .join('\n\n');
  
  return `SELECT 2 BUYER ISQs FOR INDIAN B2B MARKETPLACE - STAGE 3 ONLY

COMMON SPECIFICATIONS (Present in both Stage 1 and Stage 2):
${commonSpecsText || "No common specifications found"}

========== SELECTION RULES ==========

1. SELECT EXACTLY 2 SPECIFICATIONS from the Common Specifications list above.

2. PRIORITY ORDER (VERY IMPORTANT):
   - FIRST PRIORITY: Primary-tier specifications from Stage 1
   - SECOND PRIORITY: Secondary-tier specifications from Stage 1  
   - THIRD PRIORITY: Any other common specifications

3. OPTION SELECTION (for each chosen spec):
   - MAXIMUM 8 options per specification
   - PRIORITY ORDER for options:
     1. Options present in BOTH Stage 1 AND Stage 2 (highest priority)
     2. Options present ONLY in Stage 2
     3. Options present ONLY in Stage 1 (lowest priority)
   - Do NOT invent new options
   - If fewer than 8 options exist, include all available

4. OUTPUT REQUIREMENTS:
   - Return EXACTLY 2 specifications
   - Each with MAX 8 options
   - Use the EXACT JSON format below

========== OUTPUT FORMAT ==========
{
  "buyer_isqs": [
    {
      "name": "Specification Name 1",
      "options": ["option1", "option2", "option3"]
    },
    {
      "name": "Specification Name 2", 
      "options": ["optionA", "optionB", "optionC"]
    }
  ]
}

========== REMEMBER ==========
- This is for STAGE 3 ONLY (Buyer ISQ selection)
- Do NOT include Config ISQ or Key ISQs from Stage 2
- Select only from Common Specifications list
- Follow priority order strictly

Return ONLY the JSON object. No explanations.`;
}

// ========== COMPARISON FUNCTION (for Stage 3 spec names) ==========

export function compareResults(
  chatgptSpecs: Stage1Output,
  geminiSpecs: Stage1Output
): { common_specs: string[]; chatgpt_unique_specs: string[]; gemini_unique_specs: string[] } {
  
  const extractAllNames = (specs: Stage1Output): string[] => {
    const names: string[] = [];
    specs.seller_specs.forEach(ss => {
      ss.mcats.forEach(mcat => {
        // Primary
        mcat.finalized_specs.finalized_primary_specs.specs.forEach(s => {
          const name = String(s.spec_name || "");
          if (name) names.push(name);
        });
        // Secondary
        mcat.finalized_specs.finalized_secondary_specs.specs.forEach(s => {
          const name = String(s.spec_name || "");
          if (name) names.push(name);
        });
        // Tertiary
        mcat.finalized_specs.finalized_tertiary_specs.specs.forEach(s => {
          const name = String(s.spec_name || "");
          if (name) names.push(name);
        });
      });
    });
    return names;
  };
  
  const chatgptNames = extractAllNames(chatgptSpecs);
  const geminiNames = extractAllNames(geminiSpecs);
  
  // Normalize names for comparison
  const normalizedChatgpt = chatgptNames.map(name => normalizeSpecName(name));
  const normalizedGemini = geminiNames.map(name => normalizeSpecName(name));
  
  const common = chatgptNames.filter((name, index) => 
    normalizedGemini.includes(normalizedChatgpt[index])
  );
  
  const chatgptUnique = chatgptNames.filter((name, index) => 
    !normalizedGemini.includes(normalizedChatgpt[index])
  );
  
  const geminiUnique = geminiNames.filter((name, index) => 
    !normalizedChatgpt.includes(normalizedGemini[index])
  );
  
  return {
    common_specs: [...new Set(common)],
    chatgpt_unique_specs: [...new Set(chatgptUnique)],
    gemini_unique_specs: [...new Set(geminiUnique)]
  };
}

// ========== UTILITY FUNCTIONS ==========

async function fetchURL(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const html = await response.text();
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

* **No option should be created with vague keywords like "custom", "unbranded" , "other" etc. An option must always fit with the product of the category**  
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
 "seller_specs": [
 {
  "pmcat_id": ${input.pmcat_id ? `"${input.pmcat_id}"` : '""'},
  "pmcat_name": "${input.pmcat_name || ""}",
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
 ]
}`;
}