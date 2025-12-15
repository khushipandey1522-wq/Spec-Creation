export interface MCAT {
  mcat_name: string;
  mcat_id: string | number;
}

export interface InputData {
  pmcat_name: string;
  pmcat_id: string;
  mcats: MCAT[];
  urls: string[];
}

export interface Spec {
  spec_name: string;
  options: string[];
  input_type: "radio_button" | "multi_select";
  affix_flag: "None" | "Prefix" | "Suffix";
  affix_presence_flag: "0" | "1";
}

export interface FinalisedSpecs {
  finalized_primary_specs: {
    specs: Spec[];
  };
  finalized_secondary_specs: {
    specs: Spec[];
  };
  finalized_tertiary_specs: {
    specs: Spec[];
  };
}

export interface MCATSpec {
  category_name: string;
  mcat_id: string | number;
  finalized_specs: FinalisedSpecs;
}

export interface SellerSpec {
  pmcat_id: string;
  pmcat_name: string;
  mcats: MCATSpec[];
}

export interface Stage1Output {
  seller_specs: SellerSpec[];
}

export interface ISQ {
  name: string;
  options: string[];
  type: "config" | "key" | "buyer";
}

export interface ExcelData {
  master_specs: unknown[];
  website_evidence: unknown[];
  final_isqs: unknown[];
}

export interface ComparisonResult {
  common_specs: string[];
  chatgpt_unique_specs: string[];
  gemini_unique_specs: string[];
}
