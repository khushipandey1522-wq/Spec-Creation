import React from "react";
import { Download } from "lucide-react";
import type { ISQ } from "../types";

interface Stage2ResultsProps {
  isqs: {
    config: ISQ;
    keys: ISQ[];
  };
  onDownloadExcel: () => void;
}

export default function Stage2Results({ isqs, onDownloadExcel }: Stage2ResultsProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Stage 2: ISQ Extraction Complete</h2>
      <p className="text-gray-600 mb-8">Review the extracted ISQs below</p>

      <div className="space-y-8">

        {/* Config ISQ */}
        <div className="mb-8">
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <h2 className="text-2xl font-bold text-red-900 mb-4">Config ISQ</h2>
            <div className="mb-4">
              <p className="font-semibold text-lg text-gray-900">{isqs.config.name}</p>
              <p className="text-sm text-gray-600 mt-1">Influences pricing and primary product variation</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isqs.config.options.map((option, idx) => (
                <span key={idx} className="bg-red-200 text-red-800 px-4 py-2 rounded-full font-medium">
                  {option}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Key ISQs */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Key ISQs (3)</h2>
          <div className="grid gap-4">
            {isqs.keys.map((isq, idx) => (
              <div key={idx} className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
                <p className="font-semibold text-lg text-gray-900 mb-3">
                  {idx + 1}. {isq.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {isq.options.map((option, oIdx) => (
                    <span key={oIdx} className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm">
                      {option}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg">
          <button
            onClick={onDownloadExcel}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition"
          >
            <Download size={20} />
            Download Excel Report
          </button>
        </div>
      </div>
    </div>
  );
}
