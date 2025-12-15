import React from "react";
import type { Stage1Output } from "../types";

interface Stage1ResultsProps {
  data: Stage1Output;
}

export default function Stage1Results({ data }: Stage1ResultsProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Stage 1: Specifications Generated</h2>
      <p className="text-gray-600 mb-8">Review the generated product specifications below</p>

      <div className="space-y-8">

        {data.seller_specs.map((spec, specsIdx) => (
          <div key={specsIdx} className="mb-8">
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {spec.pmcat_name || `PMCAT ${specsIdx + 1}`}
              </h2>
              <p className="text-gray-600">ID: {spec.pmcat_id || "(blank)"}</p>
            </div>

            {spec.mcats.map((mcat, mcatIdx) => (
              <div key={mcatIdx} className="mb-8 border-l-4 border-blue-500 pl-6">
                <h3 className="text-xl font-bold text-gray-900 mb-6">{mcat.category_name}</h3>

                {/* Primary Specs */}
                {mcat.finalized_specs.finalized_primary_specs.specs.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-blue-600 mb-4">Primary Specifications</h4>
                    <div className="grid gap-4">
                      {mcat.finalized_specs.finalized_primary_specs.specs.map((spec, sIdx) => (
                        <div key={sIdx} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <div className="font-semibold text-gray-900 mb-2">{spec.spec_name}</div>
                          <div className="text-sm text-gray-600 mb-2">
                            Type: {spec.input_type} | Affix: {spec.affix_flag} | Presence:{" "}
                            {spec.affix_presence_flag}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {spec.options.map((option, oIdx) => (
                              <span key={oIdx} className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm">
                                {option}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Secondary Specs */}
                {mcat.finalized_specs.finalized_secondary_specs.specs.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-green-600 mb-4">Secondary Specifications</h4>
                    <div className="grid gap-4">
                      {mcat.finalized_specs.finalized_secondary_specs.specs.map((spec, sIdx) => (
                        <div key={sIdx} className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <div className="font-semibold text-gray-900 mb-2">{spec.spec_name}</div>
                          <div className="text-sm text-gray-600 mb-2">Type: {spec.input_type}</div>
                          <div className="flex flex-wrap gap-2">
                            {spec.options.map((option, oIdx) => (
                              <span key={oIdx} className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-sm">
                                {option}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tertiary Specs */}
                {mcat.finalized_specs.finalized_tertiary_specs.specs.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-amber-600 mb-4">Tertiary Specifications</h4>
                    <div className="grid gap-4">
                      {mcat.finalized_specs.finalized_tertiary_specs.specs.map((spec, sIdx) => (
                        <div key={sIdx} className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                          <div className="font-semibold text-gray-900 mb-2">{spec.spec_name}</div>
                          <div className="text-sm text-gray-600 mb-2">Type: {spec.input_type}</div>
                          <div className="flex flex-wrap gap-2">
                            {spec.options.map((option, oIdx) => (
                              <span key={oIdx} className="bg-amber-200 text-amber-800 px-3 py-1 rounded-full text-sm">
                                {option}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
