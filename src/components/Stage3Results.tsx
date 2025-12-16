import React from "react";
import type { Stage1Output, ISQ, Spec } from "../types";

if (!data || (!data.config && !data.keys?.length)) {
  return <div className="text-gray-500">No ISQ data found</div>;
}

interface Stage3ResultsProps {
  stage1Data: Stage1Output;
  isqs: {
    config: ISQ;
    keys: ISQ[];
    buyers: ISQ[];
  };
}

interface CommonSpec {
  spec_name: string;
  options: string[];
  input_type: "radio_button" | "multi_select";
  affix_flag: "None" | "Prefix" | "Suffix";
  affix_presence_flag: "0" | "1";
  tier: "primary" | "secondary" | "tertiary";
  isqType: string[];
}

export default function Stage3Results({ stage1Data, isqs }: Stage3ResultsProps) {
  const commonSpecs = extractCommonSpecsDetailed(stage1Data, isqs);

  const primarySpecs = commonSpecs.filter((s) => s.tier === "primary");
  const secondarySpecs = commonSpecs.filter((s) => s.tier === "secondary");
  const tertiarySpecs = commonSpecs.filter((s) => s.tier === "tertiary");

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Stage 3: Final Specifications</h2>
      <p className="text-gray-600 mb-8">
        Specifications common to both Stage 1 (generated) and Stage 2 (extracted from URLs)
      </p>

      {commonSpecs.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg text-yellow-800">
          <p className="font-semibold">No common specifications found</p>
          <p className="text-sm mt-2">There are no specifications that appear in both Stage 1 and Stage 2.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {primarySpecs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-blue-600 mb-4">Primary Specifications ({primarySpecs.length})</h3>
              <div className="grid gap-4">
                {primarySpecs.map((spec, idx) => (
                  <SpecCard key={idx} spec={spec} />
                ))}
              </div>
            </div>
          )}

          {secondarySpecs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-green-600 mb-4">Secondary Specifications ({secondarySpecs.length})</h3>
              <div className="grid gap-4">
                {secondarySpecs.map((spec, idx) => (
                  <SpecCard key={idx} spec={spec} />
                ))}
              </div>
            </div>
          )}

          {tertiarySpecs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-amber-600 mb-4">Tertiary Specifications ({tertiarySpecs.length})</h3>
              <div className="grid gap-4">
                {tertiarySpecs.map((spec, idx) => (
                  <SpecCard key={idx} spec={spec} />
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Summary:</strong> {commonSpecs.length} common specification
              {commonSpecs.length !== 1 ? "s" : ""} found across {primarySpecs.length} primary, {secondarySpecs.length}{" "}
              secondary, and {tertiarySpecs.length} tertiary specs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecCard({ spec }: { spec: CommonSpec }) {
  const colorClasses = {
    primary: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800" },
    secondary: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800" },
    tertiary: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
  };

  const colors = colorClasses[spec.tier];

  return (
    <div className={`${colors.bg} border ${colors.border} p-4 rounded-lg`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold text-gray-900 text-lg">{spec.spec_name}</div>
          <div className="text-xs text-gray-600 mt-1 space-y-1">
            <div>Type: {spec.input_type}</div>
            <div>
              Matches ISQ Types: <span className={colors.text}>{spec.isqType.join(", ")}</span>
            </div>
            {spec.affix_flag !== "None" && (
              <div>
                Affix: {spec.affix_flag} {spec.affix_presence_flag === "1" ? "(with name)" : "(value only)"}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {spec.options.map((option, idx) => (
          <span key={idx} className={`${colors.text} bg-white border border-current px-3 py-1 rounded-full text-sm`}>
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

function extractCommonSpecsDetailed(
  stage1: Stage1Output,
  isqs: { config: ISQ; keys: ISQ[]; buyers: ISQ[] }
): CommonSpec[] {
  const isqMap = new Map<string, string[]>();

  isqMap.set(isqs.config.name, ["Config"]);
  isqs.keys.forEach((k) => {
    const types = isqMap.get(k.name) || [];
    types.push("Key");
    isqMap.set(k.name, types);
  });
  isqs.buyers.forEach((b) => {
    const types = isqMap.get(b.name) || [];
    types.push("Buyer");
    isqMap.set(b.name, types);
  });

  const commonSpecs: CommonSpec[] = [];
  const specNames = new Set<string>();

  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs, finalized_tertiary_specs } =
        mcat.finalized_specs;

      const specsByTier = [
        { tier: "primary" as const, specs: finalized_primary_specs.specs },
        { tier: "secondary" as const, specs: finalized_secondary_specs.specs },
        { tier: "tertiary" as const, specs: finalized_tertiary_specs.specs },
      ];

      specsByTier.forEach(({ tier, specs }) => {
        specs.forEach((spec) => {
          if (isqMap.has(spec.spec_name) && !specNames.has(spec.spec_name)) {
            specNames.add(spec.spec_name);
            commonSpecs.push({
              spec_name: spec.spec_name,
              options: spec.options,
              input_type: spec.input_type,
              affix_flag: spec.affix_flag,
              affix_presence_flag: spec.affix_presence_flag,
              tier,
              isqType: isqMap.get(spec.spec_name) || [],
            });
          }
        });
      });
    });
  });

  return commonSpecs.sort((a, b) => {
    const tierOrder = { primary: 0, secondary: 1, tertiary: 2 };
    return tierOrder[a.tier] - tierOrder[b.tier];
  });
}
