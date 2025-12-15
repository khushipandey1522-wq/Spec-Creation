import * as XLSX from "xlsx";
import type { Stage1Output, ISQ } from "../types";

export function generateExcelFile(
  stage1: Stage1Output,
  isqs: { config: ISQ; keys: ISQ[]; buyers: ISQ[] }
) {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Master Spec Extraction
  const masterSpecs: unknown[] = [];
  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs, finalized_tertiary_specs } =
        mcat.finalized_specs;

      finalized_primary_specs.specs.forEach((s) => {
        masterSpecs.push({
          MCAT: mcat.category_name,
          "Spec Name": s.spec_name,
          Tier: "Primary",
          "Input Type": s.input_type,
          "Affix Flag": s.affix_flag,
          "Affix Presence": s.affix_presence_flag,
          "Options (Comma Separated)": s.options.join(", "),
        });
      });

      finalized_secondary_specs.specs.forEach((s) => {
        masterSpecs.push({
          MCAT: mcat.category_name,
          "Spec Name": s.spec_name,
          Tier: "Secondary",
          "Input Type": s.input_type,
          "Affix Flag": s.affix_flag,
          "Affix Presence": s.affix_presence_flag,
          "Options (Comma Separated)": s.options.join(", "),
        });
      });

      finalized_tertiary_specs.specs.forEach((s) => {
        masterSpecs.push({
          MCAT: mcat.category_name,
          "Spec Name": s.spec_name,
          Tier: "Tertiary",
          "Input Type": s.input_type,
          "Affix Flag": s.affix_flag,
          "Affix Presence": s.affix_presence_flag,
          "Options (Comma Separated)": s.options.join(", "),
        });
      });
    });
  });

  const sheet1 = XLSX.utils.json_to_sheet(masterSpecs);
  XLSX.utils.book_append_sheet(workbook, sheet1, "Master Spec Extraction");

  // Sheet 2: Website Evidence
  const websiteEvidence: unknown[] = [
    {
      "ISQ Type": "Config",
      "ISQ Name": isqs.config.name,
      "Options Found": isqs.config.options.join(", "),
    },
    ...isqs.keys.map((k, i) => ({
      "ISQ Type": "Key",
      "ISQ Name": k.name,
      "Options Found": k.options.join(", "),
      "Popularity Rank": i + 1,
    })),
  ];

  const sheet2 = XLSX.utils.json_to_sheet(websiteEvidence);
  XLSX.utils.book_append_sheet(workbook, sheet2, "Website Evidence");

  // Sheet 3: Final ISQs
  const finalISQs: unknown[] = [
    {
      Type: "Config",
      Name: isqs.config.name,
      "Option 1": isqs.config.options[0] || "",
      "Option 2": isqs.config.options[1] || "",
      "Option 3": isqs.config.options[2] || "",
      "Option 4": isqs.config.options[3] || "",
      "Option 5": isqs.config.options[4] || "",
      "Total Options": isqs.config.options.length,
    },
  ];

  isqs.keys.forEach((k) => {
    finalISQs.push({
      Type: "Key ISQ",
      Name: k.name,
      "Option 1": k.options[0] || "",
      "Option 2": k.options[1] || "",
      "Option 3": k.options[2] || "",
      "Option 4": k.options[3] || "",
      "Option 5": k.options[4] || "",
      "Total Options": k.options.length,
    });
  });

  isqs.buyers.forEach((b) => {
    finalISQs.push({
      Type: "Buyer ISQ",
      Name: b.name,
      "Option 1": b.options[0] || "",
      "Option 2": b.options[1] || "",
      "Option 3": b.options[2] || "",
      "Option 4": b.options[3] || "",
      "Option 5": b.options[4] || "",
      "Total Options": b.options.length,
    });
  });

  const sheet3 = XLSX.utils.json_to_sheet(finalISQs);
  XLSX.utils.book_append_sheet(workbook, sheet3, "Final ISQs");

  // Download
  const fileName = `ISQ_Specifications_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
