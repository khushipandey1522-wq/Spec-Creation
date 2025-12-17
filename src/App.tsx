import { useState } from "react";
import Stage0Input from "./components/Stage0Input";
import Stage1Results from "./components/Stage1Results";
import Stage2Results from "./components/Stage2Results";
import Stage3Results from "./components/Stage3Results";
import { generateStage1WithGemini, extractISQWithGemini } from "./utils/api";
import { generateExcelFile } from "./utils/excel";
import type { InputData, Stage1Output, ISQ } from "./types";
import { Download, RefreshCw } from "lucide-react";

type Stage = "stage0" | "stages";

function App() {
  const [stage, setStage] = useState<Stage>("stage0");
  const [inputData, setInputData] = useState<InputData | null>(null);
  const [stage1Data, setStage1Data] = useState<Stage1Output | null>(null);
  const [isqs, setIsqs] = useState<{ config: ISQ; keys: ISQ[]; buyers: ISQ[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"stage1" | "stage2" | "stage3">("stage1");
  const [processingStage, setProcessingStage] = useState<string>("");

  const handleStage0Submit = async (data: InputData) => {
    setInputData(data);
    setLoading(true);
    setError("");
    setStage1Data(null);
    setIsqs(null);
    setActiveTab("stage1");

    try {
      setProcessingStage("Generating Stage 1 specifications...");
      const result1 = await generateStage1WithGemini(data);
      setStage1Data(result1);

      setProcessingStage("Extracting Stage 2 ISQs from URLs...");
      const result2 = await extractISQWithGemini(data, data.urls);
      setIsqs(result2);

      setProcessingStage("All stages complete!");
      setStage("stages");
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      console.error(err);
    } finally {
      setLoading(false);
      setProcessingStage("");
    }
  };

  const handleReset = () => {
    setStage("stage0");
    setInputData(null);
    setStage1Data(null);
    setIsqs(null);
    setError("");
    setActiveTab("stage1");
  };

  const downloadJSON = (data: any, filename: string) => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadStage1JSON = () => {
    if (!stage1Data) return;
    downloadJSON(stage1Data, "stage1_output.json");
  };

  const handleDownloadStage2JSON = () => {
    if (!isqs) return;
    downloadJSON(isqs, "stage2_output.json");
  };

  const handleDownloadStage3JSON = () => {
    if (!stage1Data || !isqs) return;
    const { common_specs, buyer_isqs } = extractCommonSpecs(stage1Data, isqs);
    downloadJSON(
      {
        common_specifications: common_specs,
        buyer_isqs: buyer_isqs,
      },
      "stage3_output.json"
    );
  };

  const handleDownloadExcel = () => {
    if (stage1Data && isqs) {
      generateExcelFile(stage1Data, isqs);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md z-50">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {processingStage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-400 text-blue-700 px-6 py-3 rounded-lg shadow-lg z-50">
          <p className="font-semibold">{processingStage}</p>
        </div>
      )}

      <div className="min-h-screen">
        {stage === "stage0" && <Stage0Input onSubmit={handleStage0Submit} loading={loading} />}

        {stage === "stages" && stage1Data && (
          <div className="w-full max-w-6xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Specification Results</h1>
                  <p className="text-gray-600 mt-1">View all three stages in the tabs below</p>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-semibold rounded-lg hover:from-gray-700 hover:to-gray-800 transition"
                >
                  <RefreshCw size={20} />
                  Reset
                </button>
              </div>

              <div className="border-b border-gray-200 mb-8">
                <div className="flex gap-4">
                  <button
                    onClick={() => setActiveTab("stage1")}
                    className={`px-6 py-3 font-semibold transition ${
                      activeTab === "stage1"
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Stage 1
                  </button>
                  <button
                    onClick={() => setActiveTab("stage2")}
                    disabled={!isqs}
                    className={`px-6 py-3 font-semibold transition ${
                      activeTab === "stage2"
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : isqs
                          ? "text-gray-600 hover:text-gray-900 cursor-pointer"
                          : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Stage 2
                  </button>
                  <button
                    onClick={() => setActiveTab("stage3")}
                    disabled={!isqs}
                    className={`px-6 py-3 font-semibold transition ${
                      activeTab === "stage3"
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : isqs
                          ? "text-gray-600 hover:text-gray-900 cursor-pointer"
                          : "text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Stage 3
                  </button>
                </div>
              </div>

              {activeTab === "stage1" && (
                <>
                  <Stage1Results data={stage1Data} />
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <button
                      onClick={handleDownloadStage1JSON}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition"
                    >
                      <Download size={20} />
                      Download Stage 1 JSON
                    </button>
                  </div>
                </>
              )}

              {activeTab === "stage2" && isqs && (
                <>
                  <Stage2Results isqs={isqs} onDownloadExcel={handleDownloadExcel} />
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <button
                      onClick={handleDownloadStage2JSON}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition"
                    >
                      <Download size={20} />
                      Download Stage 2 JSON
                    </button>
                  </div>
                </>
              )}

              {activeTab === "stage3" && isqs && stage1Data && (
                <>
                  <Stage3Results stage1Data={stage1Data} isqs={isqs} />
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <button
                      onClick={handleDownloadStage3JSON}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-semibold rounded-lg hover:from-amber-700 hover:to-amber-800 transition"
                    >
                      <Download size={20} />
                      Download Stage 3 JSON
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function extractCommonSpecs(
  stage1: Stage1Output,
  isqs: { config: ISQ; keys: ISQ[]; buyers: ISQ[] }
) {
  const stage2ISQNames = new Set([
    isqs.config.name,
    ...isqs.keys.map((k) => k.name),
    ...isqs.buyers.map((b) => b.name),
  ]);

  const commonSpecs: any[] = [];
  const primarySpecs: any[] = [];
  const secondarySpecs: any[] = [];

  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs } =
        mcat.finalized_specs;

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

  const buyerISQs = filterBuyerISQs(primarySpecs, secondarySpecs, isqs.buyers);

  return {
    common_specs: [...primarySpecs, ...secondarySpecs],
    buyer_isqs: buyerISQs,
  };
}

function filterBuyerISQs(
  primarySpecs: any[],
  secondarySpecs: any[],
  buyerISQList: ISQ[]
): any[] {
  const primarySpecNames = new Set(primarySpecs.map((s) => s.spec_name));
  const secondarySpecNames = new Set(secondarySpecs.map((s) => s.spec_name));

  const validBuyerISQs = buyerISQList.filter((buyer) => {
    const isPrimary = primarySpecNames.has(buyer.name);
    const isSecondary = secondarySpecNames.has(buyer.name);
    return isPrimary || isSecondary;
  });

  const filteredISQs: any[] = [];

  for (const buyer of validBuyerISQs) {
    if (filteredISQs.length >= 2) break;

    const isPrimary = primarySpecNames.has(buyer.name);
    filteredISQs.push({
      spec_name: buyer.name,
      options: buyer.options,
      category: isPrimary ? "Primary" : "Secondary",
    });
  }

  return filteredISQs;
}

export default App;
