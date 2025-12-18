import React from "react";
import type { Stage1Output, ISQ } from "../types";

interface Stage3ResultsProps {
  stage1Data: Stage1Output;
  isqs: {
    config: ISQ;
    keys: ISQ[];
    buyers: ISQ[];
  };
}

interface CommonSpecItem {
  spec_name: string;
  options: string[];
  input_type: string;
  category: "Primary" | "Secondary";
}

interface BuyerISQItem {
  spec_name: string;
  options: string[];
  category: "Primary" | "Secondary";
}

export default function Stage3Results({ stage1Data, isqs }: Stage3ResultsProps) {
  if (!isqs || (!isqs.config && !isqs.keys?.length)) {
    return <div className="text-gray-500">No ISQ data found</div>;
  }

  const { commonSpecs, buyerISQs } = extractCommonAndBuyerSpecs(stage1Data, isqs);

  const primaryCommonSpecs = commonSpecs.filter((s) => s.category === "Primary");
  const secondaryCommonSpecs = commonSpecs.filter((s) => s.category === "Secondary");

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Stage 3: Final Specifications</h2>
      <p className="text-gray-600 mb-8">
        Specifications common to both Stage 1 and Stage 2
      </p>

      {commonSpecs.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg text-yellow-800">
          <p className="font-semibold">No common specifications found</p>
          <p className="text-sm mt-2">There are no specifications that appear in both stages.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="space-y-8">
              {primaryCommonSpecs.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-blue-600 mb-4">Common Primary Specs ({primaryCommonSpecs.length})</h3>
                  <div className="grid gap-4">
                    {primaryCommonSpecs.map((spec, idx) => (
                      <SpecCard key={idx} spec={spec} color="blue" />
                    ))}
                  </div>
                </div>
              )}

              {secondaryCommonSpecs.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-green-600 mb-4">Common Secondary Specs ({secondaryCommonSpecs.length})</h3>
                  <div className="grid gap-4">
                    {secondaryCommonSpecs.map((spec, idx) => (
                      <SpecCard key={idx} spec={spec} color="green" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-amber-900 mb-4 flex items-center gap-2">
                <span className="inline-block w-8 h-8 bg-amber-300 rounded-full flex items-center justify-center text-amber-900 text-sm font-bold">
                  {buyerISQs.length}
                </span>
                Key Buyer ISQs
              </h3>
              <p className="text-xs text-amber-700 mb-4">Selected from common specs based on buyer search patterns</p>

              {buyerISQs.length > 0 ? (
                <div className="space-y-3">
                  {buyerISQs.map((spec, idx) => (
                    <div key={idx} className="bg-white border border-amber-200 p-4 rounded-lg">
                      <div className="font-semibold text-amber-900 mb-2">{spec.spec_name}</div>
                      <div className="flex flex-wrap gap-2">
                        {spec.options.map((option, oIdx) => (
                          <span
                            key={oIdx}
                            className="inline-block bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-medium"
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-amber-200 p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-600">No buyer ISQs available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 pt-8 border-t-2 border-gray-200">
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
          <p className="text-sm text-gray-700">
            <strong>Summary:</strong> {commonSpecs.length} common specification
            {commonSpecs.length !== 1 ? "s" : ""} found across Primary and Secondary tiers.
            {buyerISQs.length > 0 && ` ${buyerISQs.length} buyer ISQ(s) highlighted for important specs.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function SpecCard({
  spec,
  color,
}: {
  spec: CommonSpecItem | BuyerISQItem;
  color: "blue" | "green" | "amber";
}) {
  const colorClasses = {
    blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", badge: "bg-blue-100" },
    green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", badge: "bg-green-100" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", badge: "bg-amber-100" },
  };

  const colors = colorClasses[color];

  return (
    <div className={`${colors.bg} border ${colors.border} p-4 rounded-lg`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="font-semibold text-gray-900 text-lg">{spec.spec_name}</div>
          <div className="text-xs text-gray-600 mt-2">
            <span className={`inline-block ${colors.badge} px-2 py-1 rounded`}>
              {spec.category}
            </span>
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

function extractCommonAndBuyerSpecs(
  stage1: Stage1Output,
  isqs: { config: ISQ; keys: ISQ[]; buyers: ISQ[] }
): { commonSpecs: CommonSpecItem[]; buyerISQs: BuyerISQItem[] } {
  const stage2ISQNamesExact = new Set([
    isqs.config.name,
    ...isqs.keys.map((k) => k.name),
  ]);

  const stage2ISQNormalized = new Map<string, string>();
  stage2ISQNamesExact.forEach((name) => {
    stage2ISQNormalized.set(normalizeSpecName(name), name);
  });

  const primarySpecs: CommonSpecItem[] = [];
  const secondarySpecs: CommonSpecItem[] = [];
  const stage1SpecMap = new Map<string, ISQ>();

  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs } = mcat.finalized_specs;

      finalized_primary_specs.specs.forEach((spec) => {
        const normalizedName = normalizeSpecName(spec.spec_name);
        const stage2Match = stage2ISQNormalized.has(normalizedName);

        if (stage2Match) {
          const filteredOptions = filterOptions(spec.options, isqs, spec.spec_name);
          primarySpecs.push({
            spec_name: spec.spec_name,
            options: filteredOptions,
            input_type: spec.input_type,
            category: "Primary",
          });
          stage1SpecMap.set(normalizedName, {
            name: spec.spec_name,
            options: spec.options,
          });
        }
      });

      finalized_secondary_specs.specs.forEach((spec) => {
        const normalizedName = normalizeSpecName(spec.spec_name);
        const stage2Match = stage2ISQNormalized.has(normalizedName);

        if (stage2Match) {
          const filteredOptions = filterOptions(spec.options, isqs, spec.spec_name);
          secondarySpecs.push({
            spec_name: spec.spec_name,
            options: filteredOptions,
            input_type: spec.input_type,
            category: "Secondary",
          });
          stage1SpecMap.set(normalizedName, {
            name: spec.spec_name,
            options: spec.options,
          });
        }
      });
    });
  });

  const stage2ConfigKeyNormalized = new Set(
    Array.from(stage2ISQNormalized.keys())
  );

  const buyerISQs = selectTopBuyerISQs(
    primarySpecs,
    secondarySpecs,
    stage2ConfigKeyNormalized
  );

  return {
    commonSpecs: [...primarySpecs, ...secondarySpecs],
    buyerISQs,
  };
}

function normalizeSpecName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/sheet|plate|material|thickness|thk|type|shape|perforation|hole/g, "")
    .trim();
}

function selectTopBuyerISQs(
  primarySpecs: CommonSpecItem[],
  secondarySpecs: CommonSpecItem[],
  stage2ConfigKeyNormalized: Set<string>
): BuyerISQItem[] {
  const candidates: Array<{
    spec_name: string;
    options: string[];
    category: "Primary" | "Secondary";
    priority: number;
  }> = [];

  primarySpecs.forEach((spec) => {
    const normalizedName = normalizeSpecName(spec.spec_name);
    const isConfigKey = stage2ConfigKeyNormalized.has(normalizedName);
    const priority = isConfigKey ? 0 : 1;

    candidates.push({
      spec_name: spec.spec_name,
      options: spec.options,
      category: "Primary",
      priority,
    });
  });

  secondarySpecs.forEach((spec) => {
    const normalizedName = normalizeSpecName(spec.spec_name);
    const isConfigKey = stage2ConfigKeyNormalized.has(normalizedName);
    const priority = isConfigKey ? 2 : 3;

    candidates.push({
      spec_name: spec.spec_name,
      options: spec.options,
      category: "Secondary",
      priority,
    });
  });

  candidates.sort((a, b) => a.priority - b.priority);

  return candidates.slice(0, 2) as BuyerISQItem[];
}

function filterOptions(
  allOptions: string[],
  isqs: { config: ISQ; keys: ISQ[]; buyers: ISQ[] },
  specName: string
): string[] {
  const stage2Options = new Set<string>();

  if (isqs.config.name === specName) {
    isqs.config.options.forEach((opt) => stage2Options.add(opt));
  }
  isqs.keys.forEach((key) => {
    if (key.name === specName) {
      key.options.forEach((opt) => stage2Options.add(opt));
    }
  });
  isqs.buyers.forEach((buyer) => {
    if (buyer.name === specName) {
      buyer.options.forEach((opt) => stage2Options.add(opt));
    }
  });

  const commonOptions = allOptions.filter((opt) => stage2Options.has(opt));
  const remainingOptions = allOptions.filter((opt) => !stage2Options.has(opt));

  const combined = [...commonOptions, ...remainingOptions];
  return combined.slice(0, 8);
}
