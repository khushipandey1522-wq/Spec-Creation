import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { InputData, MCAT } from "../types";

interface Stage0InputProps {
  onSubmit: (data: InputData) => void;
  loading?: boolean;
}

export default function Stage0Input({ onSubmit, loading = false }: Stage0InputProps) {
  const [pmcatName, setPmcatName] = useState("");
  const [pmcatId, setPmcatId] = useState("");
  const [mcats, setMcats] = useState<MCAT[]>([{ mcat_name: "", mcat_id: "" }]);
  const [urls, setUrls] = useState<string[]>([""]);
  const [errors, setErrors] = useState<string[]>([]);

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    if (mcats.length === 0) {
      newErrors.push("At least one MCAT is required");
    }

    const filledMcats = mcats.filter((m) => m.mcat_name.trim() || String(m.mcat_id).trim());
    if (filledMcats.length === 0) {
      newErrors.push("At least one MCAT with name or ID is required");
    }

    const filledUrls = urls.filter((u) => u.trim());
    if (filledUrls.length === 0) {
      newErrors.push("At least one URL is required");
    }

    filledUrls.forEach((url, idx) => {
      try {
        new URL(url);
      } catch {
        newErrors.push(`Invalid URL at position ${idx + 1}: ${url}`);
      }
    });

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    const filteredMcats = mcats.filter((m) => m.mcat_name.trim() || String(m.mcat_id).trim());
    const filteredUrls = urls.filter((u) => u.trim());

    const data: InputData = {
      pmcat_name: pmcatName,
      pmcat_id: pmcatId,
      mcats: filteredMcats,
      urls: filteredUrls,
    };

    onSubmit(data);
  };

  const addMcat = () => {
    setMcats([...mcats, { mcat_name: "", mcat_id: "" }]);
  };

  const removeMcat = (index: number) => {
    setMcats(mcats.filter((_, i) => i !== index));
  };

  const updateMcat = (index: number, field: "mcat_name" | "mcat_id", value: string) => {
    const updated = [...mcats];
    updated[index][field] = value;
    setMcats(updated);
  };

  const addUrl = () => {
    setUrls([...urls, ""]);
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const updateUrl = (index: number, value: string) => {
    const updated = [...urls];
    updated[index] = value;
    setUrls(updated);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ISQ Specification Generator</h1>
        <p className="text-gray-600 mb-8">
          Generate product specifications and extract ISQs from URLs using AI
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-800 mb-2">Please fix the following errors:</h3>
              <ul className="list-disc list-inside space-y-1 text-red-700">
                {errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Product Master Category (PMCAT)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PMCAT Name (optional)
                </label>
                <input
                  type="text"
                  value={pmcatName}
                  onChange={(e) => setPmcatName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="e.g., Steel Products"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PMCAT ID (optional)
                </label>
                <input
                  type="text"
                  value={pmcatId}
                  onChange={(e) => setPmcatId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="e.g., PM001"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Market Categories (MCATs)</h2>
              <button
                type="button"
                onClick={addMcat}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={18} /> Add MCAT
              </button>
            </div>

            {mcats.map((mcat, idx) => (
              <div key={idx} className="flex gap-3">
                <input
                  type="text"
                  value={mcat.mcat_name}
                  onChange={(e) => updateMcat(idx, "mcat_name", e.target.value)}
                  placeholder="MCAT Name"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  disabled={loading}
                />
                <input
                  type="text"
                  value={String(mcat.mcat_id)}
                  onChange={(e) => updateMcat(idx, "mcat_id", e.target.value)}
                  placeholder="MCAT ID"
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  disabled={loading}
                />
                {mcats.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMcat(idx)}
                    disabled={loading}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">URLs for ISQ Extraction</h2>
              <button
                type="button"
                onClick={addUrl}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={18} /> Add URL
              </button>
            </div>

            {urls.map((url, idx) => (
              <div key={idx} className="flex gap-3">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateUrl(idx, e.target.value)}
                  placeholder="https://example.com/product"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  disabled={loading}
                />
                {urls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeUrl(idx)}
                    disabled={loading}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Processing..." : "Generate Specifications"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
