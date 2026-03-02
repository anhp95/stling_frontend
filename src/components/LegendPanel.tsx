import React, { useState } from 'react';
import { filterData } from '../utils/filterUtils';

interface LayerConfig {
  id: string;
  name: string;
  type: string;
  dataset: string;
  visible: boolean;
  opacity: number;
  color: [number, number, number];
  filters?: any;
  vizField?: string;
  displayField?: string;
  tooltipFields?: string[];
  palette?: string[];
  data?: any[];
  filteredData?: any[];
  isLoading?: boolean;
  isSpatial?: boolean;
  pointSize?: number;
  stroked?: boolean;
}

interface LegendPanelProps {
  layers: LayerConfig[];
  schema: Record<string, any[]>;
}

const LegendPanel: React.FC<LegendPanelProps> = ({ layers, schema }) => {
  const [isOpen, setIsOpen] = useState(true);

  const activeLegendLayers = layers.filter(l => l.visible && l.data && l.data.length > 0);

  if (activeLegendLayers.length === 0) return null;

  const renderLegend = (layer: LayerConfig) => {
    const finalData = filterData(layer.filteredData || layer.data || [], layer.filters);
    
    // Single Color Legend
    if (!layer.vizField || !layer.palette) {
        return (
            <div key={layer.id} className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20 shadow-sm space-y-2">
                <div className="flex justify-between items-center gap-2 bg-gray-900/5 px-2 py-1 rounded">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate min-w-0" title={layer.dataset}>{layer.dataset}</span>
                    <span className="text-[9px] font-bold text-gray-400 shrink-0">Single Color</span>
                </div>
                <div className="flex items-center space-x-2 px-1">
                    <div className="w-3 h-3 rounded-full shadow-sm border border-black/10" style={{backgroundColor: `rgb(${layer.color[0]}, ${layer.color[1]}, ${layer.color[2]})`}} />
                    <span className="text-[10px] text-gray-600 font-medium">All Markers</span>
                    <span className="text-[9px] text-gray-400 font-mono ml-auto">{finalData.length.toLocaleString()} pts</span>
                </div>
            </div>
        );
    }
    
    const layerSchema = schema[layer.id] || [];
    const field = layerSchema.find(f => f.name === layer.vizField);
    const isNum = field && ['DOUBLE', 'INT', 'FLOAT', 'DECIMAL', 'REAL', 'BIGINT'].some(t => field.type.toUpperCase().includes(t));

    if (isNum) {
        const values = finalData.map(d => Number(d[layer.vizField!])).filter(v => !isNaN(v));
        let min = Infinity, max = -Infinity;
        for (const v of values) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        return (
            <div key={layer.id} className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20 shadow-sm space-y-2">
                <div className="flex justify-between items-center gap-2 bg-gray-900/5 px-2 py-1 rounded">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate min-w-0" title={layer.dataset}>{layer.dataset}</span>
                    <span className="text-[9px] font-bold text-blue-600 truncate max-w-24 shrink-0" title={layer.vizField}>{layer.vizField}</span>
                </div>
                <div className="h-2 w-full rounded-full overflow-hidden flex shadow-inner border border-black/5" style={{ background: `linear-gradient(to right, ${layer.palette.join(', ')})` }} />
                <div className="flex justify-between text-[9px] font-black text-gray-400 font-mono px-0.5">
                    <span>{min === Infinity ? 'N/A' : min.toLocaleString()}</span>
                    <span>{max === -Infinity ? 'N/A' : max.toLocaleString()}</span>
                </div>
            </div>
        );
    } else {
        const counts: Record<string, number> = {};
        finalData.forEach(d => {
            const val = String(d[layer.vizField!] || 'Unknown');
            counts[val] = (counts[val] || 0) + 1;
        });
        const sortedCats = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        
        return (
            <div key={layer.id} className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20 shadow-sm space-y-2">
                 <div className="flex justify-between items-center gap-2 bg-gray-900/5 px-2 py-1 rounded mb-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate min-w-0" title={layer.dataset}>{layer.dataset}</span>
                    <span className="text-[9px] font-bold text-blue-600 truncate max-w-24 shrink-0" title={layer.vizField}>{layer.vizField}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {sortedCats.map(([cat, count], i) => {
                        const color = layer.palette![i % layer.palette!.length];
                        return (
                            <div key={cat} className="flex items-center space-x-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm border border-black/10" style={{ backgroundColor: color }} />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[9px] font-bold text-gray-700 truncate leading-none mb-0.5" title={cat}>{cat}</span>
                                    <span className="text-[8px] text-gray-400 font-black tracking-tighter leading-none">{count.toLocaleString()} pts</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
  };

  return (
    <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'w-72' : 'w-12'}`}>
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 overflow-hidden flex flex-col max-h-[60vh]">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`p-3 flex items-center justify-between bg-white/90 hover:bg-gray-50/50 transition-colors ${isOpen ? 'border-b border-gray-100' : 'h-12 w-12 justify-center'}`}
        >
          {isOpen ? (
            <>
              <div className="flex items-center space-x-2">
                <div className="p-1 bg-blue-600 rounded-md">
                   <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Legends</h3>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
            </>
          ) : (
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
        </button>

        {isOpen && (
          <div className="flex-1 overflow-auto p-3 space-y-4 custom-scrollbar bg-gray-50/30">
            {activeLegendLayers.map(layer => renderLegend(layer))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LegendPanel;
