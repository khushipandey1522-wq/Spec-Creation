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

          {buyerISQs.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-amber-700 mb-4">Key Buyer ISQs ({buyerISQs.length} of max 2)</h3>
              <div className="grid gap-4">
                {buyerISQs.map((spec, idx) => (
                  <SpecCard key={idx} spec={spec} color="amber" />
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Summary:</strong> {commonSpecs.length} common specification
              {commonSpecs.length !== 1 ? "s" : ""} found. {buyerISQs.length > 0 ? `${buyerISQs.length} buyer ISQ(s) selected.` : ""}
            </p>
          </div>
        </div>
      )}
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
  const stage2ISQNames = new Set([
    isqs.config.name,
    ...isqs.keys.map((k) => k.name),
    ...isqs.buyers.map((b) => b.name),
  ]);

  const primarySpecs: CommonSpecItem[] = [];
  const secondarySpecs: CommonSpecItem[] = [];

  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs } = mcat.finalized_specs;

      finalized_primary_specs.specs.forEach((spec) => {
        if (stage2ISQNames.has(spec.spec_name)) {
          primarySpecs.push({
            spec_name: spec.spec_name,
            options: spec.options,
            input_type: spec.input_type,
            category: "Primary",
          });
        }
      });

      finalized_secondary_specs.specs.forEach((spec) => {
        if (stage2ISQNames.has(spec.spec_name)) {
          secondarySpecs.push({
            spec_name: spec.spec_name,
            options: spec.options,
            input_type: spec.input_type,
            category: "Secondary",
          });
        }
      });
    });
  });

  const primarySpecNames = new Set(primarySpecs.map((s) => s.spec_name));
  const secondarySpecNames = new Set(secondarySpecs.map((s) => s.spec_name));

  const validBuyerISQs = isqs.buyers.filter((buyer) => {
    const isPrimary = primarySpecNames.has(buyer.name);
    const isSecondary = secondarySpecNames.has(buyer.name);
    return isPrimary || isSecondary;
  });

  const buyerISQs: BuyerISQItem[] = [];
  for (const buyer of validBuyerISQs) {
    if (buyerISQs.length >= 2) break;

    const isPrimary = primarySpecNames.has(buyer.name);
    buyerISQs.push({
      spec_name: buyer.name,
      options: buyer.options,
      category: isPrimary ? "Primary" : "Secondary",
    });
  }

  return {
    commonSpecs: [...primarySpecs, ...secondarySpecs],
    buyerISQs,
  };
}
