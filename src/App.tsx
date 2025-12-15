import { useState } from "react";
import Stage0Input from "./components/Stage0Input";
import Stage1Results from "./components/Stage1Results";
import Stage2Results from "./components/Stage2Results";
import Stage3Results from "./components/Stage3Results";
import { generateStage1WithGemini, extractISQWithGemini } from "./utils/api";
import { generateExcelFile } from "./utils/excel";
import type { InputData, Stage1Output, ISQ } from "./types";
import { Download } from "lucide-react";

type Stage = "stage0" | "stages";

function App() {
  const [stage, setStage] = useState<Stage>("stage0");
  const [inputData, setInputData] = useState<InputData | null>(null);
  const [stage1Data, setStage1Data] = useState<Stage1Output | null>(null);
  const [isqs, setIsqs] = useState<{ config: ISQ; keys: ISQ[]; buyers: ISQ[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"stage1" | "stage2" | "stage3">("stage1");

  const handleStage0Submit = async (data: InputData) => {
    setInputData(data);
    setLoading(true);
    setError("");

    try {
      const result = await generateStage1WithGemini(data);
      setStage1Data(result);
      setStage("stages");
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStage1Next = async () => {
    if (!inputData || !stage1Data) return;

    setLoading(true);
    setError("");

    try {
      const result = await extractISQWithGemini(inputData, inputData.urls);
      setIsqs(result);
      setActiveTab("stage2");
    } catch (err) {
      setError(`Error extracting ISQs: ${err instanceof Error ? err.message : "Unknown error"}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (stage1Data && isqs) {
      generateExcelFile(stage1Data, isqs);
    }
  };

  const handleDownloadJSON = () => {
    if (!stage1Data || !isqs) return;

    const combinedData = {
      stage1: stage1Data,
      stage2: isqs,
      stage3: extractCommonSpecs(stage1Data, isqs),
    };

    const dataStr = JSON.stringify(combinedData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "combined_output.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md z-50">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
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
                {isqs && (
                  <button
                    onClick={handleDownloadJSON}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white font-semibold rounded-lg hover:from-orange-700 hover:to-orange-800 transition"
                  >
                    <Download size={20} />
                    Download JSON
                  </button>
                )}
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
                    Stage 1 Output
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
                    Stage 2 Output
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
                    Stage 3 Final Specs
                  </button>
                </div>
              </div>

              {activeTab === "stage1" && (
                <Stage1Results data={stage1Data} onNext={handleStage1Next} loading={loading} />
              )}

              {activeTab === "stage2" && isqs && (
                <Stage2Results
                  isqs={isqs}
                  onDownloadExcel={handleDownloadExcel}
                  loading={loading}
                />
              )}

              {activeTab === "stage3" && isqs && stage1Data && (
                <Stage3Results stage1Data={stage1Data} isqs={isqs} />
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
  const allISQNames = new Set([
    isqs.config.name,
    ...isqs.keys.map((k) => k.name),
    ...isqs.buyers.map((b) => b.name),
  ]);

  const commonSpecs: any[] = [];

  stage1.seller_specs.forEach((ss) => {
    ss.mcats.forEach((mcat) => {
      const { finalized_primary_specs, finalized_secondary_specs, finalized_tertiary_specs } =
        mcat.finalized_specs;

      const allSpecs = [
        ...finalized_primary_specs.specs,
        ...finalized_secondary_specs.specs,
        ...finalized_tertiary_specs.specs,
      ];

      allSpecs.forEach((spec) => {
        if (allISQNames.has(spec.spec_name)) {
          commonSpecs.push({
            spec_name: spec.spec_name,
            options: spec.options,
            input_type: spec.input_type,
            affix_flag: spec.affix_flag,
            affix_presence_flag: spec.affix_presence_flag,
          });
        }
      });
    });
  });

  return commonSpecs;
}

export default App;
