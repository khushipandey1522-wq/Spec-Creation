import React, { useState } from "react";
import type { Stage1Output } from "../types";
import { compareResults } from "../utils/api";

interface Stage3ComparisonProps {
  chatgptData: Stage1Output;
  onBack: () => void;
}

export default function Stage3Comparison({ chatgptData, onBack }: Stage3ComparisonProps) {
  const [secondRunData, setSecondRunData] = useState<Stage1Output | null>(null);
  const [secondRunJson, setSecondRunJson] = useState("");
  const [comparison, setComparison] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSecondRunPaste = async () => {
    if (!secondRunJson.trim()) {
      setError("Please paste the second run JSON result");
      return;
    }

    try {
      setLoading(true);
      const parsed = JSON.parse(secondRunJson);
      setSecondRunData(parsed);
      const result = compareResults(chatgptData, parsed);
      setComparison(result);
      setError("");
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Stage 3: Model Comparison</h1>
        <p className="text-gray-600 mb-8">Compare specifications from two different Gemini runs</p>

        <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Instructions:</h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-900">
            <li>Run the entire stage again with Gemini to get a second independent result</li>
            <li>Copy the entire JSON output from the second run</li>
            <li>Paste it in the textarea below</li>
            <li>Click "Compare Results" to see the differences</li>
          </ol>
        </div>

        {!comparison ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 block mb-2">Paste Second Run JSON Output</span>
              <textarea
                value={secondRunJson}
                onChange={(e) => setSecondRunJson(e.target.value)}
                placeholder='Paste the complete JSON output from the second Gemini run here (starting with { and ending with })'
                className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={loading}
              />
            </label>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>}

            <button
              onClick={handleSecondRunPaste}
              disabled={loading || !secondRunJson.trim()}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 transition"
            >
              {loading ? "Comparing..." : "Compare Results"}
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Common Specs */}
            {comparison.common_specs.length > 0 && (
              <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
                <h2 className="text-2xl font-bold text-green-900 mb-4">
                  Common Specs ({comparison.common_specs.length})
                </h2>
                <div className="space-y-2">
                  {comparison.common_specs.map((spec: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">✓</span>
                      </div>
                      <span className="text-gray-900">{spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* First Run Unique */}
            {comparison.chatgpt_unique_specs.length > 0 && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
                <h2 className="text-2xl font-bold text-blue-900 mb-4">
                  Unique to First Run ({comparison.chatgpt_unique_specs.length})
                </h2>
                <div className="space-y-2">
                  {comparison.chatgpt_unique_specs.map((spec: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">✦</span>
                      </div>
                      <span className="text-gray-900">{spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Second Run Unique */}
            {comparison.gemini_unique_specs.length > 0 && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-lg">
                <h2 className="text-2xl font-bold text-amber-900 mb-4">
                  Unique to Second Run ({comparison.gemini_unique_specs.length})
                </h2>
                <div className="space-y-2">
                  {comparison.gemini_unique_specs.map((spec: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">◆</span>
                      </div>
                      <span className="text-gray-900">{spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Summary:</strong> {comparison.common_specs.length} common specs found.{" "}
                {comparison.chatgpt_unique_specs.length} unique to first run,{" "}
                {comparison.gemini_unique_specs.length} unique to second run.
              </p>
            </div>

            <button
              onClick={() => {
                setComparison(null);
                setSecondRunJson("");
              }}
              className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition"
            >
              Reset Comparison
            </button>
          </div>
        )}

        <div className="mt-8 pt-8 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition"
          >
            Back to Results
          </button>
        </div>
      </div>
    </div>
  );
}
